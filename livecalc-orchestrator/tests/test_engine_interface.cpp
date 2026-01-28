/**
 * @file test_engine_interface.cpp
 * @brief Unit tests for ICalcEngine interface and ProjectionEngine implementation
 */

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include "../src/engine_interface.hpp"
#include "../src/projection_engine.hpp"
#include <memory>

using namespace livecalc;

/**
 * Mock engine for testing the interface
 */
class MockEngine : public ICalcEngine {
public:
    MockEngine() : initialized_(false), dispose_called_(false) {}

    void initialize(
        const std::map<std::string, std::string>& config,
        const AMCredentials* credentials = nullptr
    ) override {
        if (config.find("fail_init") != config.end()) {
            throw InitializationError("Intentional failure");
        }
        initialized_ = true;
        config_ = config;
        if (credentials) {
            credentials_ = *credentials;
        }
    }

    EngineInfo get_info() const override {
        return EngineInfo("Mock Engine", "1.0.0", "test", true, 1024);
    }

    ExecutionResult runChunk(
        const uint8_t* input_buffer,
        size_t input_size,
        uint8_t* output_buffer,
        size_t output_size
    ) override {
        ExecutionResult result;

        if (!initialized_) {
            result.success = false;
            result.error_message = "Engine not initialized";
            return result;
        }

        // Simple pass-through for testing
        if (input_buffer && output_buffer && output_size >= input_size) {
            std::memcpy(output_buffer, input_buffer, input_size);
            result.bytes_written = input_size;
        }

        result.success = true;
        result.execution_time_ms = 10.0;
        result.rows_processed = input_size / 8;
        return result;
    }

    void dispose() noexcept override {
        dispose_called_ = true;
        initialized_ = false;
    }

    bool is_initialized() const override { return initialized_; }

    bool dispose_called() const { return dispose_called_; }
    const std::map<std::string, std::string>& get_config() const { return config_; }
    const AMCredentials& get_credentials() const { return credentials_; }

private:
    bool initialized_;
    bool dispose_called_;
    std::map<std::string, std::string> config_;
    AMCredentials credentials_;
};

TEST_CASE("EngineInfo construction", "[engine_interface]") {
    EngineInfo info("Test Engine", "1.0.0", "test");

    REQUIRE(info.name == "Test Engine");
    REQUIRE(info.version == "1.0.0");
    REQUIRE(info.engine_type == "test");
    REQUIRE(info.supports_assumptions_manager == true);
    REQUIRE(info.max_buffer_size == 1024 * 1024 * 1024);
}

TEST_CASE("AMCredentials validation", "[engine_interface]") {
    SECTION("Valid credentials") {
        AMCredentials creds("https://am.example.com", "token123", "/cache");
        REQUIRE(creds.is_valid());
    }

    SECTION("Invalid credentials - empty URL") {
        AMCredentials creds("", "token123", "/cache");
        REQUIRE_FALSE(creds.is_valid());
    }

    SECTION("Invalid credentials - empty token") {
        AMCredentials creds("https://am.example.com", "", "/cache");
        REQUIRE_FALSE(creds.is_valid());
    }
}

TEST_CASE("MockEngine lifecycle", "[engine_interface]") {
    auto engine = std::make_unique<MockEngine>();

    SECTION("Initial state") {
        REQUIRE_FALSE(engine->is_initialized());
        REQUIRE_FALSE(engine->dispose_called());
    }

    SECTION("Initialization with config") {
        std::map<std::string, std::string> config = {
            {"param1", "value1"},
            {"param2", "value2"}
        };

        engine->initialize(config);

        REQUIRE(engine->is_initialized());
        REQUIRE(engine->get_config() == config);
    }

    SECTION("Initialization with credentials") {
        std::map<std::string, std::string> config = {{"param", "value"}};
        AMCredentials creds("https://am.example.com", "token123", "/cache");

        engine->initialize(config, &creds);

        REQUIRE(engine->is_initialized());
        REQUIRE(engine->get_credentials().am_url == "https://am.example.com");
        REQUIRE(engine->get_credentials().am_token == "token123");
    }

    SECTION("Initialization failure") {
        std::map<std::string, std::string> config = {{"fail_init", "true"}};

        REQUIRE_THROWS_AS(engine->initialize(config), InitializationError);
        REQUIRE_FALSE(engine->is_initialized());
    }

    SECTION("Dispose") {
        std::map<std::string, std::string> config = {{"param", "value"}};
        engine->initialize(config);
        REQUIRE(engine->is_initialized());

        engine->dispose();

        REQUIRE(engine->dispose_called());
        REQUIRE_FALSE(engine->is_initialized());
    }
}

TEST_CASE("MockEngine runChunk", "[engine_interface]") {
    auto engine = std::make_unique<MockEngine>();
    std::map<std::string, std::string> config = {{"param", "value"}};
    engine->initialize(config);

    SECTION("Successful execution") {
        uint8_t input[64];
        uint8_t output[64];

        for (size_t i = 0; i < 64; ++i) {
            input[i] = static_cast<uint8_t>(i);
        }

        ExecutionResult result = engine->runChunk(input, 64, output, 64);

        REQUIRE(result.success);
        REQUIRE(result.bytes_written == 64);
        REQUIRE(result.rows_processed == 8);
        REQUIRE(result.execution_time_ms == 10.0);

        // Verify data was copied
        for (size_t i = 0; i < 64; ++i) {
            REQUIRE(output[i] == input[i]);
        }
    }

    SECTION("Execution without initialization") {
        auto uninit_engine = std::make_unique<MockEngine>();
        uint8_t input[64];
        uint8_t output[64];

        ExecutionResult result = uninit_engine->runChunk(input, 64, output, 64);

        REQUIRE_FALSE(result.success);
        REQUIRE(result.error_message == "Engine not initialized");
    }
}

TEST_CASE("ExecutionResult defaults", "[engine_interface]") {
    ExecutionResult result;

    REQUIRE(result.success == true);
    REQUIRE(result.execution_time_ms == 0.0);
    REQUIRE(result.rows_processed == 0);
    REQUIRE(result.bytes_written == 0);
    REQUIRE(result.warnings.empty());
    REQUIRE(result.error_message.empty());
}

TEST_CASE("CalcEngineError exceptions", "[engine_interface]") {
    SECTION("InitializationError") {
        try {
            throw InitializationError("test error");
        } catch (const InitializationError& e) {
            std::string msg = e.what();
            REQUIRE_THAT(msg, Catch::Matchers::ContainsSubstring("Initialization failed"));
            REQUIRE_THAT(msg, Catch::Matchers::ContainsSubstring("test error"));
        }
    }

    SECTION("ConfigurationError") {
        try {
            throw ConfigurationError("invalid config");
        } catch (const ConfigurationError& e) {
            std::string msg = e.what();
            REQUIRE_THAT(msg, Catch::Matchers::ContainsSubstring("Configuration error"));
            REQUIRE_THAT(msg, Catch::Matchers::ContainsSubstring("invalid config"));
        }
    }

    SECTION("ExecutionError") {
        try {
            throw ExecutionError("computation failed");
        } catch (const ExecutionError& e) {
            std::string msg = e.what();
            REQUIRE_THAT(msg, Catch::Matchers::ContainsSubstring("Execution failed"));
            REQUIRE_THAT(msg, Catch::Matchers::ContainsSubstring("computation failed"));
        }
    }
}

TEST_CASE("Engine interface usage example", "[engine_interface]") {
    // Create engine
    auto engine = std::make_unique<MockEngine>();

    // Configure
    std::map<std::string, std::string> config = {
        {"num_scenarios", "100"},
        {"projection_years", "50"}
    };

    AMCredentials creds("https://am.example.com", "jwt_token", "/cache");

    // Initialize
    REQUIRE_NOTHROW(engine->initialize(config, &creds));
    REQUIRE(engine->is_initialized());

    // Get info
    EngineInfo info = engine->get_info();
    REQUIRE(info.name == "Mock Engine");
    REQUIRE(info.engine_type == "test");

    // Execute
    uint8_t input[128];
    uint8_t output[128];

    for (size_t i = 0; i < 128; ++i) {
        input[i] = static_cast<uint8_t>(i % 256);
    }

    ExecutionResult result = engine->runChunk(input, 128, output, 128);
    REQUIRE(result.success);
    REQUIRE(result.bytes_written == 128);

    // Cleanup
    REQUIRE_NOTHROW(engine->dispose());
    REQUIRE_FALSE(engine->is_initialized());
}

// Note: ProjectionEngine tests would go here but require full livecalc-engine build
// These tests validate the interface design and mock implementation
