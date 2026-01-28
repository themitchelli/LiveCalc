/**
 * @file engine_lifecycle.hpp
 * @brief Engine lifecycle management with timeout and error recovery
 *
 * The EngineLifecycleManager handles:
 * - Engine initialization with configuration validation
 * - Execution with timeout protection
 * - Error recovery and cleanup
 * - Resource disposal
 *
 * Design Pattern: Resource Manager with RAII semantics
 */

#ifndef LIVECALC_ENGINE_LIFECYCLE_HPP
#define LIVECALC_ENGINE_LIFECYCLE_HPP

#include "engine_interface.hpp"
#include "engine_factory.hpp"
#include <chrono>
#include <memory>
#include <string>
#include <map>

namespace livecalc {

/**
 * @brief Engine lifecycle state
 */
enum class EngineState {
    UNINITIALIZED,  ///< Engine created but not initialized
    INITIALIZING,   ///< Engine initialization in progress
    READY,          ///< Engine initialized and ready to run
    RUNNING,        ///< Engine executing runChunk
    ERROR,          ///< Engine in error state
    DISPOSED        ///< Engine disposed, resources freed
};

/**
 * @brief Convert engine state to string for logging
 */
inline std::string state_to_string(EngineState state) {
    switch (state) {
        case EngineState::UNINITIALIZED: return "UNINITIALIZED";
        case EngineState::INITIALIZING: return "INITIALIZING";
        case EngineState::READY: return "READY";
        case EngineState::RUNNING: return "RUNNING";
        case EngineState::ERROR: return "ERROR";
        case EngineState::DISPOSED: return "DISPOSED";
        default: return "UNKNOWN";
    }
}

/**
 * @brief Lifecycle configuration
 */
struct LifecycleConfig {
    size_t timeout_seconds;          ///< Timeout for runChunk execution (default: 300s = 5 min)
    bool auto_retry_on_error;        ///< Automatically retry once on transient errors
    bool cleanup_on_error;           ///< Call dispose() on engine errors
    size_t max_consecutive_errors;   ///< Maximum consecutive errors before abort (default: 3)

    LifecycleConfig()
        : timeout_seconds(300),
          auto_retry_on_error(false),
          cleanup_on_error(true),
          max_consecutive_errors(3) {}
};

/**
 * @brief Engine lifecycle statistics
 */
struct LifecycleStats {
    size_t successful_runs;
    size_t failed_runs;
    size_t timeout_count;
    double total_execution_time_ms;
    double average_execution_time_ms;

    LifecycleStats()
        : successful_runs(0), failed_runs(0), timeout_count(0),
          total_execution_time_ms(0.0), average_execution_time_ms(0.0) {}
};

/**
 * @brief Manages engine lifecycle: initialization, execution, cleanup
 *
 * This class wraps an ICalcEngine instance and manages its lifecycle,
 * including timeout protection, error recovery, and resource cleanup.
 *
 * Usage Example:
 *   @code
 *   EngineFactory factory;
 *   LifecycleConfig config;
 *   config.timeout_seconds = 180;  // 3 minutes
 *
 *   EngineLifecycleManager manager(factory.create_engine("cpp_projection"), config);
 *
 *   std::map<std::string, std::string> engine_config = {...};
 *   AMCredentials creds("https://am.example.com", "token", "/cache");
 *
 *   // Initialize
 *   manager.initialize(engine_config, &creds);
 *
 *   // Execute
 *   ExecutionResult result = manager.run_chunk(input, input_size, output, output_size);
 *   if (!result.success) {
 *       std::cerr << "Error: " << result.error_message << std::endl;
 *   }
 *
 *   // Cleanup (automatic via RAII)
 *   @endcode
 */
class EngineLifecycleManager {
public:
    /**
     * @brief Constructor with engine instance and lifecycle configuration
     *
     * @param engine Unique pointer to engine instance (transfers ownership)
     * @param config Lifecycle configuration (optional, uses defaults if not provided)
     */
    explicit EngineLifecycleManager(
        std::unique_ptr<ICalcEngine> engine,
        const LifecycleConfig& config = LifecycleConfig()
    );

    /**
     * @brief Destructor - automatically disposes engine if not already disposed
     */
    ~EngineLifecycleManager();

    // Disable copy (move-only semantics)
    EngineLifecycleManager(const EngineLifecycleManager&) = delete;
    EngineLifecycleManager& operator=(const EngineLifecycleManager&) = delete;

    // Enable move
    EngineLifecycleManager(EngineLifecycleManager&&) noexcept = default;
    EngineLifecycleManager& operator=(EngineLifecycleManager&&) noexcept = default;

    /**
     * @brief Initialize the engine with configuration and credentials
     *
     * Validates configuration, initializes engine, and transitions to READY state.
     *
     * @param config Engine-specific configuration
     * @param credentials Optional AM credentials
     *
     * @throws InitializationError If initialization fails
     * @throws ConfigurationError If config is invalid
     * @throws std::runtime_error If engine is already initialized or disposed
     */
    void initialize(
        const std::map<std::string, std::string>& config,
        const AMCredentials* credentials = nullptr
    );

    /**
     * @brief Execute engine with timeout protection
     *
     * Calls engine->runChunk() with timeout protection. If execution exceeds
     * timeout_seconds, the operation is aborted and returns error.
     *
     * @param input_buffer Pointer to input data
     * @param input_size Size of input buffer in bytes
     * @param output_buffer Pointer to pre-allocated output buffer
     * @param output_size Size of output buffer in bytes
     *
     * @return ExecutionResult with status and metadata
     *
     * @throws std::runtime_error If engine is not initialized
     */
    ExecutionResult run_chunk(
        const uint8_t* input_buffer,
        size_t input_size,
        uint8_t* output_buffer,
        size_t output_size
    );

    /**
     * @brief Dispose engine and free resources
     *
     * Safe to call multiple times (idempotent).
     */
    void dispose() noexcept;

    /**
     * @brief Get current engine state
     *
     * @return Current EngineState
     */
    EngineState get_state() const { return state_; }

    /**
     * @brief Get engine information
     *
     * @return EngineInfo structure (if engine is initialized)
     * @throws std::runtime_error If engine is not initialized
     */
    EngineInfo get_info() const;

    /**
     * @brief Get lifecycle statistics
     *
     * @return LifecycleStats structure with execution statistics
     */
    LifecycleStats get_stats() const { return stats_; }

    /**
     * @brief Reset statistics
     */
    void reset_stats();

private:
    std::unique_ptr<ICalcEngine> engine_;
    LifecycleConfig config_;
    EngineState state_;
    LifecycleStats stats_;
    size_t consecutive_errors_;
    std::string last_error_;

    // Helper methods
    void transition_state(EngineState new_state);
    void record_success(double execution_time_ms);
    void record_failure(const std::string& error_msg);
    bool should_retry() const;
};

} // namespace livecalc

#endif // LIVECALC_ENGINE_LIFECYCLE_HPP
