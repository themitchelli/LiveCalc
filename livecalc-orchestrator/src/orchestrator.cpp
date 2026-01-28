/**
 * @file orchestrator.cpp
 * @brief Implementation of Orchestrator with comprehensive error handling
 */

#include "orchestrator.hpp"
#include <chrono>
#include <thread>
#include <sstream>
#include <algorithm>

namespace livecalc {

Orchestrator::Orchestrator(
    const orchestrator::DAGConfig& dag_config,
    CredentialManager& credential_manager,
    const OrchestratorConfig& config,
    Logger* logger
)
    : dag_config_(dag_config),
      credential_manager_(credential_manager),
      config_(config),
      logger_(logger) {

    // Create default logger if none provided
    if (!logger_) {
        logger_ = &Logger::get_instance();
    }

    // Validate DAG configuration
    orchestrator::validate_dag_config(dag_config_);
}

OrchestrationResult Orchestrator::execute() {
    OrchestrationResult result;
    auto start_time = std::chrono::steady_clock::now();

    try {
        // Initialize engines
        initialize_engines();

        // Allocate buffers
        allocate_buffers();

        // Validate buffer sizes
        validate_buffer_sizes();

        // Get execution order from DAG
        std::vector<std::string> execution_order = orchestrator::compute_execution_order(dag_config_);

        // Execute engines in topological order
        for (const auto& node_id : execution_order) {
            // Find the engine node config
            const orchestrator::EngineNode* node = nullptr;
            for (const auto& engine : dag_config_.engines) {
                if (engine.id == node_id) {
                    node = &engine;
                    break;
                }
            }

            if (!node) {
                std::string error_msg = "Engine node not found: " + node_id;
                result.errors.push_back(error_msg);
                result.success = false;
                result.failed_engine_id = node_id;
                break;
            }

            // Get input buffer (if any)
            const uint8_t* input_buffer = nullptr;
            size_t input_size = 0;

            if (!node->inputs.empty()) {
                std::string input_name = node->inputs[0];  // Simplified: use first input
                auto buffer_it = buffer_registry_.find(input_name);
                if (buffer_it != buffer_registry_.end()) {
                    std::string buffer_id = buffer_it->second;
                    auto buffer_info = buffer_manager_.get_buffer(buffer_id);
                    input_buffer = static_cast<const uint8_t*>(buffer_info.data);
                    input_size = buffer_info.total_size;
                }
            }

            // Get output buffer
            std::string output_name = node->outputs.empty() ? node_id + "_output" : node->outputs[0];
            auto output_it = buffer_registry_.find(output_name);
            if (output_it == buffer_registry_.end()) {
                std::string error_msg = "Output buffer not found for: " + node_id;
                result.errors.push_back(error_msg);
                result.success = false;
                result.failed_engine_id = node_id;
                break;
            }

            std::string output_buffer_id = output_it->second;
            auto output_info = buffer_manager_.get_buffer(output_buffer_id);

            // Execute engine with retry
            ExecutionResult engine_result = execute_with_retry(
                node_id,
                input_buffer,
                input_size,
                static_cast<uint8_t*>(output_info.data),
                output_info.total_size
            );

            // Store engine result
            result.engine_results[node_id] = engine_result;

            // Handle engine failure
            if (!engine_result.success) {
                log_engine_failure(node_id, engine_result);

                // Check if we should continue after this error
                if (should_continue_after_error(node_id, engine_result.error_message)) {
                    result.partial_result = true;
                    result.warnings.push_back("Engine " + node_id + " failed but continuing: " +
                                            engine_result.error_message);

                    // Record partial result
                    record_partial_result(result, node_id, engine_result);
                } else {
                    // Critical failure - abort pipeline
                    result.success = false;
                    result.failed_engine_id = node_id;
                    result.errors.push_back("Critical engine failure: " + node_id + " - " +
                                          engine_result.error_message);
                    break;
                }
            }

            // Add engine warnings to result
            for (const auto& warning : engine_result.warnings) {
                result.warnings.push_back(node_id + ": " + warning);
            }
        }

        // Calculate total execution time
        auto end_time = std::chrono::steady_clock::now();
        result.total_execution_time_ms =
            std::chrono::duration<double, std::milli>(end_time - start_time).count();

        // Result is already populated with success/partial_result/errors

    } catch (const std::exception& e) {
        result.success = false;
        result.errors.push_back(std::string("Orchestration error: ") + e.what());
    }

    return result;
}

ExecutionResult Orchestrator::execute_node(
    const std::string& node_id,
    const uint8_t* input_buffer,
    size_t input_size,
    uint8_t* output_buffer,
    size_t output_size
) {
    auto it = engines_.find(node_id);
    if (it == engines_.end()) {
        ExecutionResult result;
        result.success = false;
        result.error_message = "Engine not found: " + node_id;
        return result;
    }

    return it->second->run_chunk(input_buffer, input_size, output_buffer, output_size);
}

void Orchestrator::validate_buffer_sizes() {
    for (const auto& engine : dag_config_.engines) {
        auto it = engines_.find(engine.id);
        if (it == engines_.end()) {
            continue;  // Engine not initialized yet
        }

        EngineInfo info = it->second->get_info();

        // Check output buffer sizes
        for (const auto& output_name : engine.outputs) {
            auto buffer_it = buffer_registry_.find(output_name);
            if (buffer_it != buffer_registry_.end()) {
                std::string buffer_id = buffer_it->second;
                auto buffer_info = buffer_manager_.get_buffer(buffer_id);

                if (buffer_info.total_size > info.max_buffer_size) {
                    std::ostringstream error_msg;
                    error_msg << "Buffer overflow: Engine " << engine.id
                             << " output '" << output_name << "' requires "
                             << buffer_info.total_size << " bytes but engine max is "
                             << info.max_buffer_size << " bytes. "
                             << get_chunking_suggestion(engine.id, buffer_info.total_size);

                    throw std::runtime_error(error_msg.str());
                }
            }
        }
    }
}

std::map<std::string, LifecycleStats> Orchestrator::get_engine_stats() const {
    std::map<std::string, LifecycleStats> stats;
    for (const auto& [node_id, engine] : engines_) {
        stats[node_id] = engine->get_stats();
    }
    return stats;
}

// Private helper methods

void Orchestrator::initialize_engines() {

    AMCredentials credentials = credential_manager_.get_credentials();

    for (const auto& engine_node : dag_config_.engines) {
        try {
            // Create engine instance
            auto engine = engine_factory_.create_engine(engine_node.type);

            // Create lifecycle manager
            LifecycleConfig lifecycle_config;
            lifecycle_config.auto_retry_on_error = config_.enable_retry;
            lifecycle_config.cleanup_on_error = true;
            lifecycle_config.max_consecutive_errors = 3;

            auto lifecycle_mgr = std::make_unique<EngineLifecycleManager>(
                std::move(engine),
                lifecycle_config
            );

            // Initialize engine
            lifecycle_mgr->initialize(engine_node.config, &credentials);

            // Store engine
            engines_[engine_node.id] = std::move(lifecycle_mgr);

        } catch (const InitializationError& e) {
            std::string error_msg = "Failed to initialize engine " + engine_node.id + ": " + e.what();
            throw;
        } catch (const ConfigurationError& e) {
            std::string error_msg = "Configuration error for engine " + engine_node.id + ": " + e.what();
            throw;
        }
    }
}

void Orchestrator::allocate_buffers() {

    // Allocate buffers for all outputs
    for (const auto& engine_node : dag_config_.engines) {
        for (const auto& output_name : engine_node.outputs) {
            // Parse buffer size from config (simplified - would need actual logic)
            size_t buffer_size = 1024 * 1024;  // Default 1MB

            // Check if engine config specifies buffer size
            auto size_it = engine_node.config.find(output_name + "_size");
            if (size_it != engine_node.config.end()) {
                try {
                    buffer_size = std::stoull(size_it->second);
                } catch (...) {
                    // Use default buffer size
                }
            }

            // Determine buffer type from engine type
            orchestrator::BufferType buffer_type = orchestrator::BufferType::RESULT;
            if (engine_node.type == "esg" || engine_node.type == "python_esg") {
                buffer_type = orchestrator::BufferType::SCENARIO;
            } else if (output_name.find("policies") != std::string::npos) {
                buffer_type = orchestrator::BufferType::INPUT;
            }

            // Allocate buffer
            size_t num_records = buffer_size / orchestrator::BufferManager::get_record_size(buffer_type);
            auto buffer_info = buffer_manager_.allocate_buffer(buffer_type, output_name, num_records);
            buffer_registry_[output_name] = buffer_info.name;
        }
    }
}

ExecutionResult Orchestrator::execute_with_retry(
    const std::string& node_id,
    const uint8_t* input_buffer,
    size_t input_size,
    uint8_t* output_buffer,
    size_t output_size,
    size_t attempt
) {
    auto it = engines_.find(node_id);
    if (it == engines_.end()) {
        ExecutionResult result;
        result.success = false;
        result.error_message = "Engine not found: " + node_id;
        return result;
    }

    // Execute engine
    ExecutionResult result = it->second->run_chunk(
        input_buffer, input_size,
        output_buffer, output_size
    );

    // Check for buffer overflow
    if (!result.success && is_buffer_overflow_error(result.error_message)) {
        result.error_message += " " + get_chunking_suggestion(node_id, output_size);
        return result;  // Don't retry buffer overflow errors
    }

    // Retry logic
    if (!result.success && config_.enable_retry && attempt < config_.max_retry_attempts) {

        // Exponential backoff
        size_t delay_ms = config_.retry_delay_ms * (1 << attempt);  // 1s, 2s, 4s, ...
        std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));

        return execute_with_retry(node_id, input_buffer, input_size,
                                 output_buffer, output_size, attempt + 1);
    }

    return result;
}

bool Orchestrator::is_buffer_overflow_error(const std::string& error_message) const {
    return error_message.find("buffer") != std::string::npos &&
           (error_message.find("overflow") != std::string::npos ||
            error_message.find("insufficient") != std::string::npos ||
            error_message.find("too small") != std::string::npos);
}

std::string Orchestrator::get_chunking_suggestion(const std::string& /* node_id */, size_t required_size) const {
    std::ostringstream suggestion;
    suggestion << "Suggestion: ";

    // Calculate suggested chunk size (split into 4 chunks)
    size_t chunk_size = required_size / 4;
    suggestion << "Split input into chunks of ~" << chunk_size << " bytes each. ";
    suggestion << "Process in multiple runChunk() calls.";

    return suggestion.str();
}

bool Orchestrator::is_optional_engine(const std::string& node_id) const {
    // Check if engine is marked as optional in config
    for (const auto& engine : dag_config_.engines) {
        if (engine.id == node_id) {
            auto optional_it = engine.config.find("optional");
            if (optional_it != engine.config.end()) {
                return optional_it->second == "true" || optional_it->second == "1";
            }
            break;
        }
    }
    return false;
}

bool Orchestrator::should_continue_after_error(const std::string& node_id, const std::string& /* error_message */) const {
    // Check fallback strategy
    switch (config_.fallback_strategy) {
        case FallbackStrategy::FAIL_FAST:
            return false;

        case FallbackStrategy::SKIP_OPTIONAL:
            return is_optional_engine(node_id);

        case FallbackStrategy::BEST_EFFORT:
            return true;

        case FallbackStrategy::USE_CACHED_RESULTS:
            // Would need cache implementation
            return is_optional_engine(node_id);

        default:
            return false;
    }
}

void Orchestrator::log_engine_failure(const std::string& node_id, const ExecutionResult& result) {
    // Log detailed error information using Logger
    ExecutionContext ctx;
    ctx.engine_id = node_id;
    ctx.phase = "execution";

    auto it = engines_.find(node_id);
    if (it != engines_.end()) {
        ctx.iteration = it->second->get_stats().successful_runs + it->second->get_stats().failed_runs;
        EngineInfo info = it->second->get_info();
        ctx.engine_type = info.engine_type;
    }

    // Build comprehensive error message with metrics
    std::ostringstream error_details;
    error_details << result.error_message;
    if (result.execution_time_ms > 0) {
        error_details << " [execution_time: " << result.execution_time_ms << "ms";
        error_details << ", rows_processed: " << result.rows_processed;
        error_details << ", bytes_written: " << result.bytes_written << "]";
    }

    // Log the error with full context
    logger_->log_error(ctx, error_details.str());

    // Log warnings from the execution result
    for (const auto& warning : result.warnings) {
        logger_->log_warning(ctx, warning);
    }
}

void Orchestrator::record_partial_result(OrchestrationResult& result,
                                        const std::string& node_id,
                                        const ExecutionResult& engine_result) {
    // Mark as partial result
    result.partial_result = true;

    // Add to warnings
    std::ostringstream warning;
    warning << "Engine " << node_id << " produced partial results: "
            << engine_result.rows_processed << " rows processed";
    result.warnings.push_back(warning.str());
}

} // namespace livecalc
