/**
 * @file logging_example.cpp
 * @brief Example demonstrating comprehensive logging in the orchestrator
 *
 * This example shows how to use the Logger to track:
 * - Engine initialization and configuration
 * - Execution tracking with performance metrics
 * - Error handling and reporting
 * - State transitions
 * - Buffer content debugging (when enabled)
 */

#include "../src/logger.hpp"
#include "../src/engine_lifecycle.hpp"
#include "../src/engine_factory.hpp"
#include "../src/buffer_manager.hpp"
#include <iostream>
#include <chrono>

using namespace livecalc;

int main() {
    // Configure logger
    LoggerConfig log_config;
    log_config.min_level = LogLevel::DEBUG;  // Show all logs
    log_config.enable_console = true;        // Log to stderr
    log_config.enable_file = true;           // Also log to file
    log_config.log_file_path = "orchestrator_execution.log";
    log_config.enable_json = true;           // JSON format for parsing
    log_config.enable_buffer_dump = false;   // Disable for production (large output)
    log_config.max_buffer_dump_bytes = 1024; // Limit buffer dumps

    Logger& logger = Logger::get_instance();
    logger.configure(log_config);

    std::cout << "Starting orchestrator with comprehensive logging...\n";
    std::cout << "Log level: DEBUG\n";
    std::cout << "Output: console + file (orchestrator_execution.log)\n";
    std::cout << "Format: JSON\n\n";

    // Create execution context
    ExecutionContext ctx("projection_engine_1", "projection");
    ctx.phase = "initialization";

    // Create engine factory and engine
    EngineFactory factory;
    auto engine = factory.create_engine("cpp_projection");

    // Log engine initialization
    EngineInfo info = engine->get_info();
    std::map<std::string, std::string> engine_config;
    engine_config["num_scenarios"] = "1000";
    engine_config["projection_years"] = "50";
    engine_config["output_mode"] = "detailed";

    AMCredentials credentials("https://am.example.com", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "/tmp/am_cache");

    logger.log_engine_init(ctx, info, engine_config, &credentials);

    // Initialize engine
    try {
        engine->initialize(engine_config, &credentials);
        logger.log_state_transition(ctx, EngineState::UNINITIALIZED, EngineState::READY);
    } catch (const InitializationError& e) {
        logger.log_error(ctx, e.what(), "");
        return 1;
    }

    // Log assumption resolution (simulated)
    logger.log_assumption_resolved(ctx, "mortality-standard:latest", "v2.1", 242);
    logger.log_assumption_resolved(ctx, "lapse-rates:latest", "v1.5", 50);
    logger.log_assumption_resolved(ctx, "expenses:v1.0", "v1.0", 4);

    // Create buffers for execution
    BufferManager buffer_mgr;
    constexpr size_t num_policies = 1000;
    constexpr size_t num_scenarios = 1000;

    auto input_buffer = buffer_mgr.allocate_buffer(BufferType::INPUT, num_policies);
    auto output_buffer = buffer_mgr.allocate_buffer(BufferType::RESULT, num_policies * num_scenarios);

    // Fill input buffer with sample data (normally would load from Parquet)
    InputBufferRecord* input_records = reinterpret_cast<InputBufferRecord*>(input_buffer.data);
    for (size_t i = 0; i < num_policies; ++i) {
        input_records[i].policy_id = i + 1;
        input_records[i].age = static_cast<uint8_t>(30 + (i % 40));
        input_records[i].gender = static_cast<uint8_t>(i % 2);  // 0=M, 1=F
        input_records[i].sum_assured = 100000.0 + (i * 1000.0);
        input_records[i].premium = 1000.0 + (i * 10.0);
        input_records[i].term = 10 + (i % 20);
        input_records[i].product_type = 0;  // Term life
        input_records[i].underwriting_class = 0;  // Standard
    }

    // Log execution start
    ctx.phase = "execution";
    ctx.iteration = 1;
    logger.log_execution_start(ctx, input_buffer.size_bytes, output_buffer.size_bytes);

    // Execute engine with timing
    auto start_time = std::chrono::high_resolution_clock::now();

    ExecutionResult result;
    try {
        logger.log_state_transition(ctx, EngineState::READY, EngineState::RUNNING);

        result = engine->runChunk(
            input_buffer.data,
            input_buffer.size_bytes,
            output_buffer.data,
            output_buffer.size_bytes
        );

        logger.log_state_transition(ctx, EngineState::RUNNING, EngineState::READY);
    } catch (const ExecutionError& e) {
        logger.log_error(ctx, e.what(), "Exception during runChunk");
        logger.log_state_transition(ctx, EngineState::RUNNING, EngineState::ERROR);
        return 1;
    }

    auto end_time = std::chrono::high_resolution_clock::now();
    double execution_time_ms = std::chrono::duration<double, std::milli>(end_time - start_time).count();

    // Create performance metrics
    PerformanceMetrics metrics;
    metrics.execution_time_ms = execution_time_ms;
    metrics.init_time_ms = 150.0;   // Would be measured separately
    metrics.load_time_ms = 50.0;    // Would be measured separately
    metrics.compute_time_ms = execution_time_ms - 200.0;
    metrics.input_buffer_size = input_buffer.size_bytes;
    metrics.output_buffer_size = output_buffer.size_bytes;
    metrics.rows_processed = num_policies * num_scenarios;
    metrics.memory_used_mb = (input_buffer.size_bytes + output_buffer.size_bytes) / (1024 * 1024);

    // Log execution completion
    logger.log_execution_complete(ctx, result, metrics);

    // Log warnings if any
    for (const auto& warning : result.warnings) {
        logger.log_warning(ctx, warning);
    }

    // Debug mode: dump buffer content (first 1KB of output)
    if (log_config.enable_buffer_dump) {
        logger.log_buffer_content(ctx, "output_buffer", output_buffer.data, output_buffer.size_bytes);
    }

    // Cleanup
    ctx.phase = "cleanup";
    engine->dispose();
    logger.log_state_transition(ctx, EngineState::READY, EngineState::DISPOSED);

    buffer_mgr.free_buffer(input_buffer.buffer_id);
    buffer_mgr.free_buffer(output_buffer.buffer_id);

    // Final flush
    logger.flush();

    std::cout << "\nExecution complete. Logs written to:\n";
    std::cout << "  Console: stderr\n";
    std::cout << "  File: orchestrator_execution.log\n";
    std::cout << "\nExecution summary:\n";
    std::cout << "  Rows processed: " << result.rows_processed << "\n";
    std::cout << "  Execution time: " << execution_time_ms << " ms\n";
    std::cout << "  Throughput: " << (result.rows_processed * 1000.0 / execution_time_ms) << " rows/sec\n";
    std::cout << "  Success: " << (result.success ? "Yes" : "No") << "\n";

    if (!result.success) {
        std::cout << "  Error: " << result.error_message << "\n";
    }

    return result.success ? 0 : 1;
}
