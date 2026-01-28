/**
 * @file logger.hpp
 * @brief Structured logging for orchestrator with JSON output
 *
 * The Logger provides structured logging capabilities with:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - JSON-formatted output for easy parsing
 * - Context tracking (engine ID, iteration, buffer sizes)
 * - Metrics collection (execution time, memory usage)
 * - Debug mode with detailed buffer content logging
 *
 * Design Pattern: Singleton logger with structured event emission
 */

#ifndef LIVECALC_LOGGER_HPP
#define LIVECALC_LOGGER_HPP

#include "engine_interface.hpp"
#include "engine_lifecycle.hpp"
#include <string>
#include <map>
#include <vector>
#include <memory>
#include <chrono>
#include <ostream>
#include <fstream>
#include <sstream>
#include <iomanip>

namespace livecalc {

/**
 * @brief Log severity levels
 */
enum class LogLevel {
    DEBUG,   ///< Detailed debugging information (buffer contents, intermediate values)
    INFO,    ///< Informational messages (engine initialization, execution start/end)
    WARN,    ///< Warning messages (non-fatal issues, performance warnings)
    ERROR    ///< Error messages (failures, exceptions)
};

/**
 * @brief Convert log level to string
 */
inline std::string level_to_string(LogLevel level) {
    switch (level) {
        case LogLevel::DEBUG: return "DEBUG";
        case LogLevel::INFO: return "INFO";
        case LogLevel::WARN: return "WARN";
        case LogLevel::ERROR: return "ERROR";
        default: return "UNKNOWN";
    }
}

/**
 * @brief Parse log level from string
 */
inline LogLevel string_to_level(const std::string& level_str) {
    if (level_str == "DEBUG") return LogLevel::DEBUG;
    if (level_str == "INFO") return LogLevel::INFO;
    if (level_str == "WARN") return LogLevel::WARN;
    if (level_str == "ERROR") return LogLevel::ERROR;
    return LogLevel::INFO;  // default
}

/**
 * @brief Execution context for logging
 */
struct ExecutionContext {
    std::string engine_id;           ///< Engine identifier in DAG
    std::string engine_type;         ///< Engine type (esg, projection, solver)
    size_t iteration;                ///< Current iteration number (for multi-iteration engines)
    std::string phase;               ///< Current execution phase (init, load, execute, cleanup)

    ExecutionContext()
        : engine_id(""), engine_type(""), iteration(0), phase("") {}

    ExecutionContext(const std::string& id, const std::string& type)
        : engine_id(id), engine_type(type), iteration(0), phase("") {}
};

/**
 * @brief Performance metrics for logging
 */
struct PerformanceMetrics {
    double execution_time_ms;        ///< Total execution time
    double init_time_ms;             ///< Initialization time
    double load_time_ms;             ///< Data loading time
    double compute_time_ms;          ///< Computation time
    size_t input_buffer_size;        ///< Input buffer size in bytes
    size_t output_buffer_size;       ///< Output buffer size in bytes
    size_t rows_processed;           ///< Number of rows processed
    size_t memory_used_mb;           ///< Estimated memory usage in MB

    PerformanceMetrics()
        : execution_time_ms(0.0), init_time_ms(0.0), load_time_ms(0.0),
          compute_time_ms(0.0), input_buffer_size(0), output_buffer_size(0),
          rows_processed(0), memory_used_mb(0) {}
};

/**
 * @brief Logger configuration
 */
struct LoggerConfig {
    LogLevel min_level;              ///< Minimum log level to output
    bool enable_console;             ///< Log to console (stderr)
    bool enable_file;                ///< Log to file
    std::string log_file_path;       ///< File path for logs
    bool enable_json;                ///< Output as JSON (vs. plain text)
    bool enable_buffer_dump;         ///< Dump buffer contents in debug mode (WARNING: large output)
    size_t max_buffer_dump_bytes;    ///< Maximum bytes to dump per buffer (default: 1024)

    LoggerConfig()
        : min_level(LogLevel::INFO),
          enable_console(true),
          enable_file(false),
          log_file_path("orchestrator.log"),
          enable_json(true),
          enable_buffer_dump(false),
          max_buffer_dump_bytes(1024) {}
};

/**
 * @brief Structured logger with JSON output
 *
 * The Logger provides centralized logging for the orchestrator with structured
 * events that can be parsed by monitoring systems.
 *
 * Usage Example:
 *   @code
 *   LoggerConfig config;
 *   config.min_level = LogLevel::DEBUG;
 *   config.enable_file = true;
 *   config.log_file_path = "orchestrator.log";
 *
 *   Logger& logger = Logger::get_instance();
 *   logger.configure(config);
 *
 *   ExecutionContext ctx("proj_1", "projection");
 *   logger.log_engine_init(ctx, engine_info, config_map, &credentials);
 *
 *   PerformanceMetrics metrics;
 *   metrics.execution_time_ms = 1234.5;
 *   logger.log_execution_complete(ctx, result, metrics);
 *   @endcode
 */
class Logger {
public:
    /**
     * @brief Get singleton logger instance
     */
    static Logger& get_instance();

    /**
     * @brief Configure logger with new settings
     *
     * @param config Logger configuration
     */
    void configure(const LoggerConfig& config);

    /**
     * @brief Log engine initialization
     *
     * @param ctx Execution context
     * @param info Engine information
     * @param config Engine configuration
     * @param credentials Optional AM credentials (token will be masked)
     */
    void log_engine_init(
        const ExecutionContext& ctx,
        const EngineInfo& info,
        const std::map<std::string, std::string>& config,
        const AMCredentials* credentials = nullptr
    );

    /**
     * @brief Log assumptions resolved from Assumptions Manager
     *
     * @param ctx Execution context
     * @param assumption_name Assumption name (e.g., "mortality-standard:v2.1")
     * @param resolved_version Actual version resolved (e.g., "v2.1")
     * @param rows_loaded Number of rows loaded
     */
    void log_assumption_resolved(
        const ExecutionContext& ctx,
        const std::string& assumption_name,
        const std::string& resolved_version,
        size_t rows_loaded
    );

    /**
     * @brief Log runChunk execution start
     *
     * @param ctx Execution context
     * @param input_size Input buffer size
     * @param output_size Output buffer size
     */
    void log_execution_start(
        const ExecutionContext& ctx,
        size_t input_size,
        size_t output_size
    );

    /**
     * @brief Log runChunk execution completion
     *
     * @param ctx Execution context
     * @param result Execution result
     * @param metrics Performance metrics
     */
    void log_execution_complete(
        const ExecutionContext& ctx,
        const ExecutionResult& result,
        const PerformanceMetrics& metrics
    );

    /**
     * @brief Log error with context
     *
     * @param ctx Execution context
     * @param error_message Error message
     * @param stack_trace Optional stack trace
     */
    void log_error(
        const ExecutionContext& ctx,
        const std::string& error_message,
        const std::string& stack_trace = ""
    );

    /**
     * @brief Log warning message
     *
     * @param ctx Execution context
     * @param warning_message Warning message
     */
    void log_warning(
        const ExecutionContext& ctx,
        const std::string& warning_message
    );

    /**
     * @brief Log buffer content (debug mode only)
     *
     * @param ctx Execution context
     * @param buffer_name Buffer identifier (e.g., "input", "output")
     * @param buffer Pointer to buffer
     * @param size Buffer size
     */
    void log_buffer_content(
        const ExecutionContext& ctx,
        const std::string& buffer_name,
        const uint8_t* buffer,
        size_t size
    );

    /**
     * @brief Log lifecycle state transition
     *
     * @param ctx Execution context
     * @param old_state Previous state
     * @param new_state New state
     */
    void log_state_transition(
        const ExecutionContext& ctx,
        EngineState old_state,
        EngineState new_state
    );

    /**
     * @brief Flush all log outputs
     */
    void flush();

    /**
     * @brief Set minimum log level
     *
     * @param level Minimum level to output
     */
    void set_min_level(LogLevel level) { config_.min_level = level; }

    /**
     * @brief Get current log level
     *
     * @return Current minimum log level
     */
    LogLevel get_min_level() const { return config_.min_level; }

private:
    Logger();
    ~Logger();

    // Disable copy and move
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;
    Logger(Logger&&) = delete;
    Logger& operator=(Logger&&) = delete;

    LoggerConfig config_;
    std::unique_ptr<std::ofstream> file_stream_;

    // Helper methods
    void log(LogLevel level, const std::string& message, const std::map<std::string, std::string>& fields);
    std::string get_timestamp() const;
    std::string mask_token(const std::string& token) const;
    std::string format_json(const std::map<std::string, std::string>& fields) const;
    std::string escape_json_string(const std::string& str) const;
    std::string buffer_to_hex(const uint8_t* buffer, size_t size, size_t max_bytes) const;
    void write_output(const std::string& output);
};

} // namespace livecalc

#endif // LIVECALC_LOGGER_HPP
