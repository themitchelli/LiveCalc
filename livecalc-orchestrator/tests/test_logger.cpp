/**
 * @file test_logger.cpp
 * @brief Unit tests for Logger
 */

#include <catch2/catch_test_macros.hpp>
#include "../src/logger.hpp"
#include <fstream>
#include <sstream>
#include <filesystem>
#include <thread>
#include <chrono>

using namespace livecalc;

// Helper function to parse JSON log line
std::map<std::string, std::string> parse_json_log(const std::string& line) {
    std::map<std::string, std::string> result;

    // Very simple JSON parser for test purposes (not production quality)
    size_t pos = 1;  // Skip opening {
    while (pos < line.size() - 1) {
        // Find key
        size_t key_start = line.find('"', pos);
        if (key_start == std::string::npos) break;
        size_t key_end = line.find('"', key_start + 1);
        std::string key = line.substr(key_start + 1, key_end - key_start - 1);

        // Find value
        size_t val_start = line.find('"', key_end + 1);
        if (val_start == std::string::npos) break;
        size_t val_end = line.find('"', val_start + 1);
        std::string value = line.substr(val_start + 1, val_end - val_start - 1);

        result[key] = value;
        pos = val_end + 1;
    }

    return result;
}

TEST_CASE("Logger Configuration", "[logger]") {
    Logger& logger = Logger::get_instance();

    SECTION("Default configuration") {
        LoggerConfig config;

        REQUIRE(config.min_level == LogLevel::INFO);
        REQUIRE(config.enable_console == true);
        REQUIRE(config.enable_file == false);
        REQUIRE(config.enable_json == true);
        REQUIRE(config.enable_buffer_dump == false);
        REQUIRE(config.max_buffer_dump_bytes == 1024);
    }

    SECTION("Custom configuration") {
        LoggerConfig config;
        config.min_level = LogLevel::DEBUG;
        config.enable_file = true;
        config.log_file_path = "test_log.log";
        config.enable_buffer_dump = true;
        config.max_buffer_dump_bytes = 512;

        logger.configure(config);

        REQUIRE(logger.get_min_level() == LogLevel::DEBUG);

        // Cleanup
        std::filesystem::remove("test_log.log");
    }

    SECTION("Log level filtering") {
        LoggerConfig config;
        config.min_level = LogLevel::WARN;
        config.enable_console = false;
        logger.configure(config);

        REQUIRE(logger.get_min_level() == LogLevel::WARN);
        // Debug and Info should be filtered out
    }
}

TEST_CASE("Logger Engine Initialization Logging", "[logger]") {
    Logger& logger = Logger::get_instance();

    LoggerConfig config;
    config.min_level = LogLevel::DEBUG;
    config.enable_console = false;
    config.enable_file = true;
    config.log_file_path = "test_engine_init.log";
    logger.configure(config);

    ExecutionContext ctx("proj_1", "projection");
    EngineInfo info("C++ Projection Engine", "1.0.0", "projection", true, 1024 * 1024 * 1024);

    std::map<std::string, std::string> engine_config;
    engine_config["num_scenarios"] = "1000";
    engine_config["projection_years"] = "50";

    AMCredentials creds("https://am.example.com", "very_long_secret_token_12345", "/tmp/cache");

    logger.log_engine_init(ctx, info, engine_config, &creds);
    logger.flush();

    // Read log file
    std::ifstream file("test_engine_init.log");
    std::string line;
    std::getline(file, line);
    file.close();

    auto fields = parse_json_log(line);

    REQUIRE(fields["event"] == "engine_init");
    REQUIRE(fields["engine_id"] == "proj_1");
    REQUIRE(fields["engine_type"] == "projection");
    REQUIRE(fields["engine_name"] == "C++ Projection Engine");
    REQUIRE(fields["engine_version"] == "1.0.0");
    REQUIRE(fields["supports_am"] == "true");
    REQUIRE(fields["config.num_scenarios"] == "1000");
    REQUIRE(fields["config.projection_years"] == "50");
    REQUIRE(fields["am_url"] == "https://am.example.com");

    // Token should be masked
    std::string masked_token = fields["am_token"];
    REQUIRE(masked_token.find("...") != std::string::npos);
    REQUIRE(masked_token != "very_long_secret_token_12345");

    // Cleanup
    std::filesystem::remove("test_engine_init.log");
}

TEST_CASE("Logger Execution Tracking", "[logger]") {
    Logger& logger = Logger::get_instance();

    ExecutionContext ctx("esg_1", "esg");
    ctx.iteration = 5;
    ctx.phase = "compute";

    SECTION("Execution start") {
        LoggerConfig config;
        config.enable_console = false;
        config.enable_file = true;
        config.log_file_path = "test_execution_start.log";
        logger.configure(config);

        logger.log_execution_start(ctx, 1024 * 1024, 512 * 1024);
        logger.flush();

        std::ifstream file("test_execution_start.log");
        std::string line;
        std::getline(file, line);
        file.close();

        auto fields = parse_json_log(line);

        REQUIRE(fields["event"] == "execution_start");
        REQUIRE(fields["engine_id"] == "esg_1");
        REQUIRE(fields["iteration"] == "5");
        REQUIRE(fields["phase"] == "compute");
        REQUIRE(fields["input_size_bytes"] == std::to_string(1024 * 1024));

        std::filesystem::remove("test_execution_start.log");
    }

    SECTION("Execution complete - success") {
        LoggerConfig config;
        config.enable_console = false;
        config.enable_file = true;
        config.log_file_path = "test_execution_success.log";
        logger.configure(config);

        ExecutionResult result;
        result.success = true;
        result.execution_time_ms = 1234.5;
        result.rows_processed = 10000;
        result.bytes_written = 400000;

        PerformanceMetrics metrics;
        metrics.init_time_ms = 100.0;
        metrics.load_time_ms = 200.0;
        metrics.compute_time_ms = 900.0;
        metrics.memory_used_mb = 512;

        logger.log_execution_complete(ctx, result, metrics);
        logger.flush();

        std::ifstream file("test_execution_success.log");
        std::string line;
        std::getline(file, line);
        file.close();

        auto fields = parse_json_log(line);

        REQUIRE(fields["event"] == "execution_complete");
        REQUIRE(fields["success"] == "true");
        REQUIRE(fields["rows_processed"] == "10000");
        REQUIRE(std::stod(fields["init_time_ms"]) == 100.0);
        REQUIRE(std::stoi(fields["memory_used_mb"]) == 512);

        std::filesystem::remove("test_execution_success.log");
    }

    SECTION("Execution complete - failure") {
        LoggerConfig config;
        config.enable_console = false;
        config.enable_file = true;
        config.log_file_path = "test_execution_failure.log";
        logger.configure(config);

        ExecutionResult result;
        result.success = false;
        result.execution_time_ms = 500.0;
        result.error_message = "Out of memory";

        PerformanceMetrics metrics;

        logger.log_execution_complete(ctx, result, metrics);
        logger.flush();

        std::ifstream file("test_execution_failure.log");
        std::string line;
        std::getline(file, line);
        file.close();

        auto fields = parse_json_log(line);

        REQUIRE(fields["event"] == "execution_complete");
        REQUIRE(fields["success"] == "false");
        REQUIRE(fields["error"] == "Out of memory");

        std::filesystem::remove("test_execution_failure.log");
    }
}

TEST_CASE("Logger Error and Warning Logging", "[logger]") {
    Logger& logger = Logger::get_instance();

    ExecutionContext ctx("solver_1", "solver");
    ctx.iteration = 10;

    SECTION("Error logging") {
        LoggerConfig config;
        config.enable_console = false;
        config.enable_file = true;
        config.log_file_path = "test_error.log";
        logger.configure(config);

        logger.log_error(ctx, "Solver did not converge", "Stack trace here...");
        logger.flush();

        std::ifstream file("test_error.log");
        std::string line;
        std::getline(file, line);
        file.close();

        auto fields = parse_json_log(line);

        REQUIRE(fields["event"] == "error");
        REQUIRE(fields["engine_id"] == "solver_1");
        REQUIRE(fields["error_message"] == "Solver did not converge");
        REQUIRE(fields["stack_trace"] == "Stack trace here...");

        std::filesystem::remove("test_error.log");
    }

    SECTION("Warning logging") {
        LoggerConfig config;
        config.enable_console = false;
        config.enable_file = true;
        config.log_file_path = "test_warning.log";
        logger.configure(config);

        logger.log_warning(ctx, "Convergence slow, may timeout");
        logger.flush();

        std::ifstream file("test_warning.log");
        std::string line;
        std::getline(file, line);
        file.close();

        auto fields = parse_json_log(line);

        REQUIRE(fields["event"] == "warning");
        REQUIRE(fields["warning"] == "Convergence slow, may timeout");

        std::filesystem::remove("test_warning.log");
    }
}

TEST_CASE("Logger Buffer Dumping", "[logger]") {
    Logger& logger = Logger::get_instance();

    LoggerConfig config;
    config.min_level = LogLevel::DEBUG;
    config.enable_console = false;
    config.enable_file = true;
    config.log_file_path = "test_buffers.log";
    config.enable_buffer_dump = true;
    config.max_buffer_dump_bytes = 16;
    logger.configure(config);

    ExecutionContext ctx("test_engine", "test");

    uint8_t buffer[32];
    for (size_t i = 0; i < 32; ++i) {
        buffer[i] = static_cast<uint8_t>(i);
    }

    logger.log_buffer_content(ctx, "test_buffer", buffer, 32);
    logger.flush();

    std::ifstream file("test_buffers.log");
    std::string line;
    std::getline(file, line);
    file.close();

    auto fields = parse_json_log(line);

    REQUIRE(fields["event"] == "buffer_dump");
    REQUIRE(fields["buffer_name"] == "test_buffer");
    REQUIRE(fields["buffer_size"] == "32");
    REQUIRE(fields["dumped_bytes"] == "16");
    REQUIRE(fields["truncated"] == "true");

    // Check hex data
    std::string hex = fields["hex_data"];
    REQUIRE(!hex.empty());

    // Cleanup
    std::filesystem::remove("test_buffers.log");
}

TEST_CASE("Logger State Transitions", "[logger]") {
    Logger& logger = Logger::get_instance();

    LoggerConfig config;
    config.min_level = LogLevel::DEBUG;
    config.enable_console = false;
    config.enable_file = true;
    config.log_file_path = "test_states.log";
    logger.configure(config);

    ExecutionContext ctx("proj_1", "projection");

    logger.log_state_transition(ctx, EngineState::UNINITIALIZED, EngineState::READY);
    logger.flush();

    std::ifstream file("test_states.log");
    std::string line;
    std::getline(file, line);
    file.close();

    auto fields = parse_json_log(line);

    REQUIRE(fields["event"] == "state_transition");
    REQUIRE(fields["old_state"] == "UNINITIALIZED");
    REQUIRE(fields["new_state"] == "READY");

    // Cleanup
    std::filesystem::remove("test_states.log");
}

TEST_CASE("Logger Assumption Resolution", "[logger]") {
    Logger& logger = Logger::get_instance();

    LoggerConfig config;
    config.enable_console = false;
    config.enable_file = true;
    config.log_file_path = "test_assumptions.log";
    logger.configure(config);

    ExecutionContext ctx("proj_1", "projection");

    logger.log_assumption_resolved(ctx, "mortality-standard", "v2.1", 242);
    logger.flush();

    std::ifstream file("test_assumptions.log");
    std::string line;
    std::getline(file, line);
    file.close();

    auto fields = parse_json_log(line);

    REQUIRE(fields["event"] == "assumption_resolved");
    REQUIRE(fields["assumption_name"] == "mortality-standard");
    REQUIRE(fields["resolved_version"] == "v2.1");
    REQUIRE(fields["rows_loaded"] == "242");

    // Cleanup
    std::filesystem::remove("test_assumptions.log");
}

TEST_CASE("Logger JSON Escaping", "[logger]") {
    Logger& logger = Logger::get_instance();

    LoggerConfig config;
    config.enable_console = false;
    config.enable_file = true;
    config.log_file_path = "test_escape.log";
    logger.configure(config);

    ExecutionContext ctx("test", "test");

    // Test with special characters in error message
    logger.log_error(ctx, "Error with \"quotes\" and \nnewlines\tand tabs", "");
    logger.flush();

    std::ifstream file("test_escape.log");
    std::string line;
    std::getline(file, line);
    file.close();

    // Should be valid JSON
    REQUIRE(line.find("\\\"") != std::string::npos);  // Escaped quotes
    REQUIRE(line.find("\\n") != std::string::npos);   // Escaped newline
    REQUIRE(line.find("\\t") != std::string::npos);   // Escaped tab

    // Cleanup
    std::filesystem::remove("test_escape.log");
}
