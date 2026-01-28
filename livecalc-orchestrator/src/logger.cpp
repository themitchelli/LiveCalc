/**
 * @file logger.cpp
 * @brief Implementation of structured logger
 */

#include "logger.hpp"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <ctime>
#include <algorithm>

namespace livecalc {

Logger& Logger::get_instance() {
    static Logger instance;
    return instance;
}

Logger::Logger() {
    // Default configuration
    config_ = LoggerConfig();
}

Logger::~Logger() {
    flush();
    if (file_stream_ && file_stream_->is_open()) {
        file_stream_->close();
    }
}

void Logger::configure(const LoggerConfig& config) {
    config_ = config;

    // Open log file if enabled
    if (config_.enable_file) {
        file_stream_ = std::make_unique<std::ofstream>(config_.log_file_path, std::ios::app);
        if (!file_stream_->is_open()) {
            std::cerr << "Warning: Failed to open log file: " << config_.log_file_path << std::endl;
        }
    }
}

void Logger::log_engine_init(
    const ExecutionContext& ctx,
    const EngineInfo& info,
    const std::map<std::string, std::string>& config,
    const AMCredentials* credentials
) {
    std::map<std::string, std::string> fields;
    fields["event"] = "engine_init";
    fields["engine_id"] = ctx.engine_id;
    fields["engine_type"] = ctx.engine_type;
    fields["engine_name"] = info.name;
    fields["engine_version"] = info.version;
    fields["supports_am"] = info.supports_assumptions_manager ? "true" : "false";
    fields["max_buffer_size"] = std::to_string(info.max_buffer_size);

    // Add engine config (limit to non-sensitive fields)
    size_t config_count = 0;
    for (const auto& [key, value] : config) {
        if (config_count < 10) {  // Limit to first 10 config entries
            fields["config." + key] = value;
            config_count++;
        }
    }
    if (config.size() > 10) {
        fields["config_truncated"] = "true";
        fields["config_total_count"] = std::to_string(config.size());
    }

    // Add AM credentials info (mask token)
    if (credentials && credentials->is_valid()) {
        fields["am_url"] = credentials->am_url;
        fields["am_token"] = mask_token(credentials->am_token);
        fields["cache_dir"] = credentials->cache_dir;
    } else {
        fields["am_credentials"] = "none";
    }

    log(LogLevel::INFO, "Engine initialized", fields);
}

void Logger::log_assumption_resolved(
    const ExecutionContext& ctx,
    const std::string& assumption_name,
    const std::string& resolved_version,
    size_t rows_loaded
) {
    std::map<std::string, std::string> fields;
    fields["event"] = "assumption_resolved";
    fields["engine_id"] = ctx.engine_id;
    fields["assumption_name"] = assumption_name;
    fields["resolved_version"] = resolved_version;
    fields["rows_loaded"] = std::to_string(rows_loaded);

    log(LogLevel::INFO, "Resolved assumption from AM", fields);
}

void Logger::log_execution_start(
    const ExecutionContext& ctx,
    size_t input_size,
    size_t output_size
) {
    std::map<std::string, std::string> fields;
    fields["event"] = "execution_start";
    fields["engine_id"] = ctx.engine_id;
    fields["engine_type"] = ctx.engine_type;
    fields["iteration"] = std::to_string(ctx.iteration);
    fields["phase"] = ctx.phase;
    fields["input_size_bytes"] = std::to_string(input_size);
    fields["output_size_bytes"] = std::to_string(output_size);
    fields["input_size_mb"] = std::to_string(input_size / (1024.0 * 1024.0));
    fields["output_size_mb"] = std::to_string(output_size / (1024.0 * 1024.0));

    log(LogLevel::INFO, "Starting execution", fields);
}

void Logger::log_execution_complete(
    const ExecutionContext& ctx,
    const ExecutionResult& result,
    const PerformanceMetrics& metrics
) {
    std::map<std::string, std::string> fields;
    fields["event"] = "execution_complete";
    fields["engine_id"] = ctx.engine_id;
    fields["engine_type"] = ctx.engine_type;
    fields["iteration"] = std::to_string(ctx.iteration);
    fields["phase"] = ctx.phase;
    fields["success"] = result.success ? "true" : "false";
    fields["execution_time_ms"] = std::to_string(result.execution_time_ms);
    fields["rows_processed"] = std::to_string(result.rows_processed);
    fields["bytes_written"] = std::to_string(result.bytes_written);

    // Performance metrics
    fields["init_time_ms"] = std::to_string(metrics.init_time_ms);
    fields["load_time_ms"] = std::to_string(metrics.load_time_ms);
    fields["compute_time_ms"] = std::to_string(metrics.compute_time_ms);
    fields["memory_used_mb"] = std::to_string(metrics.memory_used_mb);
    fields["throughput_rows_per_sec"] = std::to_string(
        result.execution_time_ms > 0 ? (result.rows_processed * 1000.0 / result.execution_time_ms) : 0
    );

    // Warnings
    if (!result.warnings.empty()) {
        fields["warning_count"] = std::to_string(result.warnings.size());
        for (size_t i = 0; i < std::min(result.warnings.size(), size_t(5)); ++i) {
            fields["warning_" + std::to_string(i)] = result.warnings[i];
        }
    }

    // Error message if failed
    if (!result.success) {
        fields["error"] = result.error_message;
    }

    log(result.success ? LogLevel::INFO : LogLevel::ERROR, "Execution completed", fields);
}

void Logger::log_error(
    const ExecutionContext& ctx,
    const std::string& error_message,
    const std::string& stack_trace
) {
    std::map<std::string, std::string> fields;
    fields["event"] = "error";
    fields["engine_id"] = ctx.engine_id;
    fields["engine_type"] = ctx.engine_type;
    fields["iteration"] = std::to_string(ctx.iteration);
    fields["phase"] = ctx.phase;
    fields["error_message"] = error_message;

    if (!stack_trace.empty()) {
        fields["stack_trace"] = stack_trace;
    }

    log(LogLevel::ERROR, "Engine error", fields);
}

void Logger::log_warning(
    const ExecutionContext& ctx,
    const std::string& warning_message
) {
    std::map<std::string, std::string> fields;
    fields["event"] = "warning";
    fields["engine_id"] = ctx.engine_id;
    fields["engine_type"] = ctx.engine_type;
    fields["warning"] = warning_message;

    log(LogLevel::WARN, warning_message, fields);
}

void Logger::log_buffer_content(
    const ExecutionContext& ctx,
    const std::string& buffer_name,
    const uint8_t* buffer,
    size_t size
) {
    if (!config_.enable_buffer_dump) {
        return;  // Buffer dumping disabled
    }

    std::map<std::string, std::string> fields;
    fields["event"] = "buffer_dump";
    fields["engine_id"] = ctx.engine_id;
    fields["buffer_name"] = buffer_name;
    fields["buffer_size"] = std::to_string(size);

    size_t dump_size = std::min(size, config_.max_buffer_dump_bytes);
    fields["hex_data"] = buffer_to_hex(buffer, size, dump_size);
    fields["dumped_bytes"] = std::to_string(dump_size);

    if (dump_size < size) {
        fields["truncated"] = "true";
    }

    log(LogLevel::DEBUG, "Buffer content dump", fields);
}

void Logger::log_state_transition(
    const ExecutionContext& ctx,
    EngineState old_state,
    EngineState new_state
) {
    std::map<std::string, std::string> fields;
    fields["event"] = "state_transition";
    fields["engine_id"] = ctx.engine_id;
    fields["old_state"] = state_to_string(old_state);
    fields["new_state"] = state_to_string(new_state);

    log(LogLevel::DEBUG, "State transition", fields);
}

void Logger::flush() {
    if (config_.enable_console) {
        std::cerr.flush();
    }
    if (file_stream_ && file_stream_->is_open()) {
        file_stream_->flush();
    }
}

void Logger::log(
    LogLevel level,
    const std::string& message,
    const std::map<std::string, std::string>& fields
) {
    // Skip if below minimum level
    if (level < config_.min_level) {
        return;
    }

    std::string output;

    if (config_.enable_json) {
        // JSON format
        std::map<std::string, std::string> json_fields = fields;
        json_fields["timestamp"] = get_timestamp();
        json_fields["level"] = level_to_string(level);
        json_fields["message"] = message;
        output = format_json(json_fields);
    } else {
        // Plain text format
        std::ostringstream oss;
        oss << get_timestamp() << " [" << level_to_string(level) << "] " << message;

        if (!fields.empty()) {
            oss << " {";
            bool first = true;
            for (const auto& [key, value] : fields) {
                if (!first) oss << ", ";
                oss << key << "=" << value;
                first = false;
            }
            oss << "}";
        }

        output = oss.str();
    }

    write_output(output);
}

std::string Logger::get_timestamp() const {
    auto now = std::chrono::system_clock::now();
    auto time_t_now = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()
    ) % 1000;

    std::tm tm_buf;
#ifdef _WIN32
    localtime_s(&tm_buf, &time_t_now);
#else
    localtime_r(&time_t_now, &tm_buf);
#endif

    std::ostringstream oss;
    oss << std::put_time(&tm_buf, "%Y-%m-%d %H:%M:%S");
    oss << "." << std::setfill('0') << std::setw(3) << ms.count();

    return oss.str();
}

std::string Logger::mask_token(const std::string& token) const {
    if (token.size() <= 8) {
        return "***";
    }
    // Show first 4 and last 4 characters
    return token.substr(0, 4) + "..." + token.substr(token.size() - 4);
}

std::string Logger::format_json(const std::map<std::string, std::string>& fields) const {
    std::ostringstream oss;
    oss << "{";

    bool first = true;
    for (const auto& [key, value] : fields) {
        if (!first) oss << ",";
        oss << "\"" << escape_json_string(key) << "\":\"" << escape_json_string(value) << "\"";
        first = false;
    }

    oss << "}";
    return oss.str();
}

std::string Logger::escape_json_string(const std::string& str) const {
    std::ostringstream oss;
    for (char c : str) {
        switch (c) {
            case '"':  oss << "\\\""; break;
            case '\\': oss << "\\\\"; break;
            case '\n': oss << "\\n"; break;
            case '\r': oss << "\\r"; break;
            case '\t': oss << "\\t"; break;
            default:
                if (c >= 0 && c < 32) {
                    // Escape control characters
                    oss << "\\u" << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(c);
                } else {
                    oss << c;
                }
        }
    }
    return oss.str();
}

std::string Logger::buffer_to_hex(const uint8_t* buffer, size_t size, size_t max_bytes) const {
    std::ostringstream oss;
    size_t bytes_to_dump = std::min(size, max_bytes);

    for (size_t i = 0; i < bytes_to_dump; ++i) {
        if (i > 0 && i % 16 == 0) {
            oss << " ";
        }
        oss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(buffer[i]);
    }

    return oss.str();
}

void Logger::write_output(const std::string& output) {
    if (config_.enable_console) {
        std::cerr << output << std::endl;
    }

    if (config_.enable_file && file_stream_ && file_stream_->is_open()) {
        *file_stream_ << output << std::endl;
    }
}

} // namespace livecalc
