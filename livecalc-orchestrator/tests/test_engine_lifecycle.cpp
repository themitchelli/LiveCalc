/**
 * @file test_engine_lifecycle.cpp
 * @brief Tests for engine lifecycle management
 */

#include <catch2/catch_test_macros.hpp>
#include "../src/engine_factory.hpp"
#include "../src/engine_lifecycle.hpp"
#include "../src/buffer_manager.hpp"
#include <cstring>
#include <thread>
#include <chrono>

using namespace livecalc;

// ============================================================================
// Test Fixtures and Helpers
// ============================================================================

// Mock engine for testing lifecycle management
class MockSlowEngine : public ICalcEngine {
public:
    MockSlowEngine() : initialized_(false), delay_ms_(0), should_fail_(false) {}

    void set_delay(size_t ms) { delay_ms_ = ms; }
    void set_should_fail(bool fail) { should_fail_ = fail; }

    void initialize(
        const std::map<std::string, std::string>& config,
        const AMCredentials* credentials = nullptr
    ) override {
        if (config.find("fail_init") != config.end()) {
            throw InitializationError("Mock initialization failure");
        }
        initialized_ = true;
    }

    EngineInfo get_info() const override {
        return EngineInfo("Mock Slow Engine", "1.0.0", "test", false, 1024*1024);
    }

    ExecutionResult runChunk(
        const uint8_t* input_buffer,
        size_t input_size,
        uint8_t* output_buffer,
        size_t output_size
    ) override {
        if (!initialized_) {
            throw ExecutionError("Engine not initialized");
        }

        // Simulate slow execution
        if (delay_ms_ > 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms_));
        }

        if (should_fail_) {
            throw ExecutionError("Mock execution failure");
        }

        ExecutionResult result;
        result.success = true;
        result.execution_time_ms = static_cast<double>(delay_ms_);
        result.rows_processed = 100;
        result.bytes_written = output_size;
        return result;
    }

    void dispose() noexcept override {
        initialized_ = false;
    }

    bool is_initialized() const override {
        return initialized_;
    }

private:
    bool initialized_;
    size_t delay_ms_;
    bool should_fail_;
};

// ============================================================================
// EngineFactory Tests
// ============================================================================

TEST_CASE("EngineFactory: Create projection engine", "[factory]") {
    EngineFactory factory;

    auto engine = factory.create_engine(EngineType::PROJECTION);
    REQUIRE(engine != nullptr);

    auto info = engine->get_info();
    REQUIRE(info.engine_type == "projection");
}

TEST_CASE("EngineFactory: Unknown engine type throws", "[factory]") {
    EngineFactory factory;

    REQUIRE_THROWS_AS(
        factory.create_engine("unknown_engine_type"),
        ConfigurationError
    );
}

TEST_CASE("EngineFactory: List registered engines", "[factory]") {
    EngineFactory factory;

    auto types = factory.list_engine_types();
    REQUIRE(types.size() >= 1);
    REQUIRE(std::find(types.begin(), types.end(), EngineType::PROJECTION) != types.end());
}

TEST_CASE("EngineFactory: Register custom engine", "[factory]") {
    EngineFactory factory;

    factory.register_engine("mock_engine", []() -> std::unique_ptr<ICalcEngine> {
        return std::make_unique<MockSlowEngine>();
    });

    REQUIRE(factory.is_registered("mock_engine"));

    auto engine = factory.create_engine("mock_engine");
    REQUIRE(engine != nullptr);

    auto info = engine->get_info();
    REQUIRE(info.name == "Mock Slow Engine");
}

TEST_CASE("EngineFactory: Cannot register duplicate engine type", "[factory]") {
    EngineFactory factory;

    factory.register_engine("test_engine", []() -> std::unique_ptr<ICalcEngine> {
        return std::make_unique<MockSlowEngine>();
    });

    REQUIRE_THROWS_AS(
        factory.register_engine("test_engine", []() -> std::unique_ptr<ICalcEngine> {
            return std::make_unique<MockSlowEngine>();
        }),
        ConfigurationError
    );
}

// ============================================================================
// EngineLifecycleManager Tests
// ============================================================================

TEST_CASE("Lifecycle: Initialize and dispose", "[lifecycle]") {
    auto mock = std::make_unique<MockSlowEngine>();
    EngineLifecycleManager manager(std::move(mock));

    REQUIRE(manager.get_state() == EngineState::UNINITIALIZED);

    std::map<std::string, std::string> config;
    manager.initialize(config);

    REQUIRE(manager.get_state() == EngineState::READY);

    manager.dispose();
    REQUIRE(manager.get_state() == EngineState::DISPOSED);
}

TEST_CASE("Lifecycle: Successful execution", "[lifecycle]") {
    auto mock = std::make_unique<MockSlowEngine>();
    mock->set_delay(100);  // 100ms delay

    EngineLifecycleManager manager(std::move(mock));

    std::map<std::string, std::string> config;
    manager.initialize(config);

    uint8_t input[32] = {0};
    uint8_t output[64] = {0};

    auto result = manager.run_chunk(input, sizeof(input), output, sizeof(output));

    REQUIRE(result.success);
    REQUIRE(result.rows_processed == 100);
    REQUIRE(result.execution_time_ms >= 100.0);

    auto stats = manager.get_stats();
    REQUIRE(stats.successful_runs == 1);
    REQUIRE(stats.failed_runs == 0);
}

TEST_CASE("Lifecycle: Execution timeout", "[lifecycle]") {
    auto mock = std::make_unique<MockSlowEngine>();
    mock->set_delay(3000);  // 3 second delay

    LifecycleConfig config;
    config.timeout_seconds = 1;  // 1 second timeout

    EngineLifecycleManager manager(std::move(mock), config);

    std::map<std::string, std::string> engine_config;
    manager.initialize(engine_config);

    uint8_t input[32] = {0};
    uint8_t output[64] = {0};

    auto result = manager.run_chunk(input, sizeof(input), output, sizeof(output));

    REQUIRE_FALSE(result.success);
    REQUIRE(result.error_message.find("timeout") != std::string::npos);

    auto stats = manager.get_stats();
    REQUIRE(stats.timeout_count == 1);
}

TEST_CASE("Lifecycle: Execution failure", "[lifecycle]") {
    auto mock = std::make_unique<MockSlowEngine>();
    mock->set_should_fail(true);

    EngineLifecycleManager manager(std::move(mock));

    std::map<std::string, std::string> config;
    manager.initialize(config);

    uint8_t input[32] = {0};
    uint8_t output[64] = {0};

    auto result = manager.run_chunk(input, sizeof(input), output, sizeof(output));

    REQUIRE_FALSE(result.success);
    REQUIRE(result.error_message.find("Mock execution failure") != std::string::npos);

    auto stats = manager.get_stats();
    REQUIRE(stats.failed_runs == 1);
}

TEST_CASE("Lifecycle: Auto-retry on error", "[lifecycle]") {
    // Make a custom mock that fails once, then succeeds
    class RetryableMockEngine : public MockSlowEngine {
    public:
        mutable int call_count_;
        RetryableMockEngine() : call_count_(0) {}

        ExecutionResult runChunk(
            const uint8_t* input_buffer,
            size_t input_size,
            uint8_t* output_buffer,
            size_t output_size
        ) override {
            call_count_++;
            if (call_count_ == 1) {
                throw ExecutionError("Transient error");
            }
            ExecutionResult result;
            result.success = true;
            result.rows_processed = 100;
            result.bytes_written = output_size;
            return result;
        }
    };

    auto retryable = std::make_unique<RetryableMockEngine>();
    RetryableMockEngine* retryable_ptr = retryable.get();

    LifecycleConfig config;
    config.auto_retry_on_error = true;

    EngineLifecycleManager manager(std::move(retryable), config);

    std::map<std::string, std::string> engine_config;
    manager.initialize(engine_config);

    uint8_t input[32] = {0};
    uint8_t output[64] = {0};

    auto result = manager.run_chunk(input, sizeof(input), output, sizeof(output));

    REQUIRE(result.success);  // Should succeed on retry
    REQUIRE(retryable_ptr->call_count_ == 2);  // Should have attempted twice
}

TEST_CASE("Lifecycle: Max consecutive errors", "[lifecycle]") {
    auto mock = std::make_unique<MockSlowEngine>();
    mock->set_should_fail(true);

    LifecycleConfig config;
    config.max_consecutive_errors = 3;
    config.cleanup_on_error = true;

    EngineLifecycleManager manager(std::move(mock), config);

    std::map<std::string, std::string> engine_config;
    manager.initialize(engine_config);

    uint8_t input[32] = {0};
    uint8_t output[64] = {0};

    // First error
    auto result1 = manager.run_chunk(input, sizeof(input), output, sizeof(output));
    REQUIRE_FALSE(result1.success);
    REQUIRE(manager.get_state() == EngineState::READY);  // Should recover

    // Second error
    auto result2 = manager.run_chunk(input, sizeof(input), output, sizeof(output));
    REQUIRE_FALSE(result2.success);
    REQUIRE(manager.get_state() == EngineState::READY);  // Should recover

    // Third error - should trigger cleanup
    auto result3 = manager.run_chunk(input, sizeof(input), output, sizeof(output));
    REQUIRE_FALSE(result3.success);
    REQUIRE(manager.get_state() == EngineState::DISPOSED);  // Should be disposed
}

TEST_CASE("Lifecycle: Initialization failure", "[lifecycle]") {
    auto mock = std::make_unique<MockSlowEngine>();

    EngineLifecycleManager manager(std::move(mock));

    std::map<std::string, std::string> config;
    config["fail_init"] = "true";

    REQUIRE_THROWS_AS(manager.initialize(config), InitializationError);
    REQUIRE(manager.get_state() == EngineState::ERROR);
}

TEST_CASE("Lifecycle: Get info before initialization fails", "[lifecycle]") {
    auto mock = std::make_unique<MockSlowEngine>();

    EngineLifecycleManager manager(std::move(mock));

    REQUIRE_THROWS_AS(manager.get_info(), std::runtime_error);
}

TEST_CASE("Lifecycle: Statistics tracking", "[lifecycle]") {
    auto mock = std::make_unique<MockSlowEngine>();
    mock->set_delay(50);  // 50ms delay

    EngineLifecycleManager manager(std::move(mock));

    std::map<std::string, std::string> config;
    manager.initialize(config);

    uint8_t input[32] = {0};
    uint8_t output[64] = {0};

    // Execute 5 times
    for (int i = 0; i < 5; ++i) {
        auto result = manager.run_chunk(input, sizeof(input), output, sizeof(output));
        REQUIRE(result.success);
    }

    auto stats = manager.get_stats();
    REQUIRE(stats.successful_runs == 5);
    REQUIRE(stats.failed_runs == 0);
    REQUIRE(stats.average_execution_time_ms >= 50.0);
    REQUIRE(stats.total_execution_time_ms >= 250.0);
}

TEST_CASE("Lifecycle: Reset statistics", "[lifecycle]") {
    auto mock = std::make_unique<MockSlowEngine>();

    EngineLifecycleManager manager(std::move(mock));

    std::map<std::string, std::string> config;
    manager.initialize(config);

    uint8_t input[32] = {0};
    uint8_t output[64] = {0};

    // Execute once
    manager.run_chunk(input, sizeof(input), output, sizeof(output));

    auto stats_before = manager.get_stats();
    REQUIRE(stats_before.successful_runs == 1);

    manager.reset_stats();

    auto stats_after = manager.get_stats();
    REQUIRE(stats_after.successful_runs == 0);
    REQUIRE(stats_after.total_execution_time_ms == 0.0);
}

TEST_CASE("Lifecycle: Dispose is idempotent", "[lifecycle]") {
    auto mock = std::make_unique<MockSlowEngine>();

    EngineLifecycleManager manager(std::move(mock));

    std::map<std::string, std::string> config;
    manager.initialize(config);

    manager.dispose();
    REQUIRE(manager.get_state() == EngineState::DISPOSED);

    // Call dispose again
    manager.dispose();
    REQUIRE(manager.get_state() == EngineState::DISPOSED);
}

// ============================================================================
// Integration Tests
// ============================================================================

TEST_CASE("Integration: Factory and lifecycle work together", "[integration]") {
    EngineFactory factory;
    auto engine = factory.create_engine(EngineType::PROJECTION);

    LifecycleConfig config;
    config.timeout_seconds = 60;

    EngineLifecycleManager manager(std::move(engine), config);

    SECTION("Engine created via factory can be managed") {
        REQUIRE(manager.get_state() == EngineState::UNINITIALIZED);

        auto types = factory.list_engine_types();
        REQUIRE(types.size() >= 1);
        REQUIRE(std::find(types.begin(), types.end(), EngineType::PROJECTION) != types.end());

        // Note: Not attempting full initialization as sample data files may not exist
        // The test validates that factory and lifecycle work together at the API level
    }
}
