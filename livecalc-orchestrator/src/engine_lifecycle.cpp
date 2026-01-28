/**
 * @file engine_lifecycle.cpp
 * @brief Implementation of EngineLifecycleManager
 */

#include "engine_lifecycle.hpp"
#include <iostream>
#include <chrono>
#include <thread>
#include <future>

namespace livecalc {

EngineLifecycleManager::EngineLifecycleManager(
    std::unique_ptr<ICalcEngine> engine,
    const LifecycleConfig& config
)
    : engine_(std::move(engine)),
      config_(config),
      state_(EngineState::UNINITIALIZED),
      consecutive_errors_(0) {

    if (!engine_) {
        throw std::invalid_argument("EngineLifecycleManager: engine cannot be null");
    }
}

EngineLifecycleManager::~EngineLifecycleManager() {
    dispose();
}

void EngineLifecycleManager::initialize(
    const std::map<std::string, std::string>& config,
    const AMCredentials* credentials
) {
    if (state_ == EngineState::DISPOSED) {
        throw std::runtime_error("Cannot initialize disposed engine");
    }

    if (state_ != EngineState::UNINITIALIZED) {
        throw std::runtime_error("Engine already initialized. Current state: " +
                                state_to_string(state_));
    }

    transition_state(EngineState::INITIALIZING);

    try {
        engine_->initialize(config, credentials);
        transition_state(EngineState::READY);
        consecutive_errors_ = 0;
        last_error_.clear();
    } catch (const InitializationError& e) {
        transition_state(EngineState::ERROR);
        last_error_ = e.what();
        record_failure(e.what());
        throw;
    } catch (const ConfigurationError& e) {
        transition_state(EngineState::ERROR);
        last_error_ = e.what();
        record_failure(e.what());
        throw;
    } catch (const std::exception& e) {
        transition_state(EngineState::ERROR);
        last_error_ = std::string("Unexpected error during initialization: ") + e.what();
        record_failure(last_error_);
        throw InitializationError(last_error_);
    }
}

ExecutionResult EngineLifecycleManager::run_chunk(
    const uint8_t* input_buffer,
    size_t input_size,
    uint8_t* output_buffer,
    size_t output_size
) {
    if (state_ != EngineState::READY) {
        ExecutionResult result;
        result.success = false;
        result.error_message = "Engine not ready. Current state: " + state_to_string(state_);
        record_failure(result.error_message);
        return result;
    }

    transition_state(EngineState::RUNNING);

    auto start_time = std::chrono::steady_clock::now();

    ExecutionResult result;
    bool timeout_occurred = false;

    try {
        // Execute with timeout protection using std::async
        auto future = std::async(std::launch::async, [this, input_buffer, input_size, output_buffer, output_size]() {
            return engine_->runChunk(input_buffer, input_size, output_buffer, output_size);
        });

        // Wait for result with timeout
        auto timeout_duration = std::chrono::seconds(config_.timeout_seconds);
        if (future.wait_for(timeout_duration) == std::future_status::timeout) {
            timeout_occurred = true;
            result.success = false;
            result.error_message = "Execution timeout after " +
                                  std::to_string(config_.timeout_seconds) + " seconds";
            stats_.timeout_count++;
        } else {
            result = future.get();
        }
    } catch (const ExecutionError& e) {
        result.success = false;
        result.error_message = e.what();
    } catch (const std::exception& e) {
        result.success = false;
        result.error_message = std::string("Unexpected error during execution: ") + e.what();
    }

    auto end_time = std::chrono::steady_clock::now();
    double actual_time_ms = std::chrono::duration<double, std::milli>(end_time - start_time).count();

    // If engine didn't report time, use actual measurement
    if (result.execution_time_ms == 0.0) {
        result.execution_time_ms = actual_time_ms;
    }

    // Handle result
    if (result.success) {
        transition_state(EngineState::READY);
        record_success(result.execution_time_ms);
        consecutive_errors_ = 0;
    } else {
        record_failure(result.error_message);
        consecutive_errors_++;

        // Check if we should attempt retry
        if (config_.auto_retry_on_error && should_retry() && !timeout_occurred) {
            std::cerr << "Retrying after error: " << result.error_message << std::endl;
            // Transition back to READY for retry
            transition_state(EngineState::READY);
            // Retry once
            return run_chunk(input_buffer, input_size, output_buffer, output_size);
        }

        // No retry - transition to ERROR
        transition_state(EngineState::ERROR);

        // Check if we've exceeded max consecutive errors
        if (consecutive_errors_ >= config_.max_consecutive_errors) {
            std::cerr << "Max consecutive errors (" << config_.max_consecutive_errors
                     << ") exceeded. Engine in ERROR state." << std::endl;
            if (config_.cleanup_on_error) {
                dispose();
            }
        } else {
            // Transition back to READY for potential recovery
            transition_state(EngineState::READY);
        }
    }

    return result;
}

void EngineLifecycleManager::dispose() noexcept {
    if (state_ == EngineState::DISPOSED) {
        return;  // Already disposed
    }

    try {
        if (engine_) {
            engine_->dispose();
        }
    } catch (...) {
        // Ignore exceptions in dispose (must be noexcept)
        std::cerr << "Warning: Exception during engine disposal (ignored)" << std::endl;
    }

    transition_state(EngineState::DISPOSED);
}

EngineInfo EngineLifecycleManager::get_info() const {
    if (!engine_ || state_ == EngineState::UNINITIALIZED || state_ == EngineState::DISPOSED) {
        throw std::runtime_error("Cannot get info from uninitialized or disposed engine");
    }

    return engine_->get_info();
}

void EngineLifecycleManager::reset_stats() {
    stats_ = LifecycleStats();
}

// Private helper methods

void EngineLifecycleManager::transition_state(EngineState new_state) {
    state_ = new_state;
}

void EngineLifecycleManager::record_success(double execution_time_ms) {
    stats_.successful_runs++;
    stats_.total_execution_time_ms += execution_time_ms;
    stats_.average_execution_time_ms = stats_.total_execution_time_ms /
                                       (stats_.successful_runs + stats_.failed_runs);
    last_error_.clear();
}

void EngineLifecycleManager::record_failure(const std::string& error_msg) {
    stats_.failed_runs++;
    if (stats_.successful_runs > 0) {
        stats_.average_execution_time_ms = stats_.total_execution_time_ms /
                                           (stats_.successful_runs + stats_.failed_runs);
    }
    last_error_ = error_msg;
}

bool EngineLifecycleManager::should_retry() const {
    // Only retry if we haven't exceeded max consecutive errors
    // and this is the first error in sequence
    return consecutive_errors_ == 1;
}

} // namespace livecalc
