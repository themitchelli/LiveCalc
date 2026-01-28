/**
 * @file orchestrator.hpp
 * @brief Main orchestration layer coordinating engine execution with comprehensive error handling
 *
 * The Orchestrator is responsible for:
 * - Executing DAG of calculation engines
 * - Managing data flow between engines via SharedArrayBuffer
 * - Coordinating credential management
 * - Handling errors and providing fallback strategies
 * - Logging execution progress and failures
 *
 * Error Handling & Resilience (US-008):
 * - Clear error messages with context (engine, iteration, config issue)
 * - Retry logic with exponential backoff for transient errors
 * - Fallback strategies (skip optional engines, return partial results)
 * - Buffer overflow detection with chunking suggestions
 * - Assumption resolution error tracking
 * - Partial result recovery (e.g., return Projection results if Solver fails)
 */

#ifndef LIVECALC_ORCHESTRATOR_HPP
#define LIVECALC_ORCHESTRATOR_HPP

#include "engine_interface.hpp"
#include "engine_factory.hpp"
#include "engine_lifecycle.hpp"
#include "buffer_manager.hpp"
#include "credential_manager.hpp"
#include "dag_config.hpp"
#include "logger.hpp"
#include <memory>
#include <vector>
#include <map>
#include <string>

namespace livecalc {

/**
 * @brief Orchestration result containing execution status and outputs
 */
struct OrchestrationResult {
    bool success;                                 ///< True if pipeline completed successfully
    bool partial_result;                          ///< True if some engines failed but results are usable
    std::map<std::string, ExecutionResult> engine_results;  ///< Results per engine node
    std::vector<std::string> errors;              ///< Errors encountered during execution
    std::vector<std::string> warnings;            ///< Non-fatal warnings
    double total_execution_time_ms;               ///< Total pipeline execution time
    std::string failed_engine_id;                 ///< ID of engine that caused failure (if applicable)

    OrchestrationResult()
        : success(true), partial_result(false), total_execution_time_ms(0.0) {}
};

/**
 * @brief Fallback strategy for handling engine failures
 */
enum class FallbackStrategy {
    FAIL_FAST,           ///< Abort immediately on first error
    SKIP_OPTIONAL,       ///< Skip optional engines, continue with required ones
    BEST_EFFORT,         ///< Try all engines, return whatever results we get
    USE_CACHED_RESULTS   ///< Use cached results from previous successful run
};

/**
 * @brief Orchestrator configuration
 */
struct OrchestratorConfig {
    FallbackStrategy fallback_strategy;
    bool enable_retry;                    ///< Enable automatic retry on transient errors
    size_t max_retry_attempts;            ///< Maximum retry attempts per engine (default: 2)
    size_t retry_delay_ms;                ///< Delay between retries in milliseconds (default: 1000)
    bool enable_partial_results;          ///< Return partial results on non-critical failures
    bool log_engine_output;               ///< Log engine stdout/stderr on failures

    OrchestratorConfig()
        : fallback_strategy(FallbackStrategy::FAIL_FAST),
          enable_retry(true),
          max_retry_attempts(2),
          retry_delay_ms(1000),
          enable_partial_results(true),
          log_engine_output(true) {}
};

/**
 * @brief Main orchestrator coordinating engine execution
 *
 * The Orchestrator executes a DAG of calculation engines, managing data flow,
 * credentials, and error recovery.
 *
 * Usage Example:
 *   @code
 *   // Load DAG configuration
 *   DAGConfig dag_config = ConfigParser::parse_file("pipeline.json");
 *
 *   // Setup credentials
 *   CredentialManager cred_mgr;
 *   cred_mgr.update_credentials("https://am.example.com", "jwt_token", "/cache");
 *
 *   // Create orchestrator
 *   OrchestratorConfig orch_config;
 *   orch_config.fallback_strategy = FallbackStrategy::SKIP_OPTIONAL;
 *
 *   Orchestrator orchestrator(dag_config, cred_mgr, orch_config);
 *
 *   // Execute pipeline
 *   OrchestrationResult result = orchestrator.execute();
 *
 *   if (result.success) {
 *       std::cout << "Pipeline completed successfully" << std::endl;
 *   } else if (result.partial_result) {
 *       std::cout << "Pipeline partially complete with warnings" << std::endl;
 *       for (const auto& warning : result.warnings) {
 *           std::cout << "  - " << warning << std::endl;
 *       }
 *   } else {
 *       std::cerr << "Pipeline failed: " << result.failed_engine_id << std::endl;
 *       for (const auto& error : result.errors) {
 *           std::cerr << "  - " << error << std::endl;
 *       }
 *   }
 *   @endcode
 */
class Orchestrator {
public:
    /**
     * @brief Constructor with DAG configuration and credentials
     *
     * @param dag_config DAG configuration defining engine pipeline
     * @param credential_manager Credential manager for AM authentication
     * @param config Orchestrator configuration (optional)
     * @param logger Logger instance (optional, uses default if nullptr)
     */
    Orchestrator(
        const orchestrator::DAGConfig& dag_config,
        CredentialManager& credential_manager,
        const OrchestratorConfig& config = OrchestratorConfig(),
        Logger* logger = nullptr
    );

    /**
     * @brief Execute the entire pipeline
     *
     * Executes engines in topological order, managing data flow and error recovery.
     *
     * @return OrchestrationResult with execution status and results
     */
    OrchestrationResult execute();

    /**
     * @brief Execute a single engine node
     *
     * For testing or advanced use cases where manual engine execution is needed.
     *
     * @param node_id Engine node ID from DAG configuration
     * @param input_buffer Optional input buffer (nullptr for engines with no dependencies)
     * @param input_size Size of input buffer
     * @param output_buffer Pre-allocated output buffer
     * @param output_size Size of output buffer
     *
     * @return ExecutionResult from the engine
     */
    ExecutionResult execute_node(
        const std::string& node_id,
        const uint8_t* input_buffer,
        size_t input_size,
        uint8_t* output_buffer,
        size_t output_size
    );

    /**
     * @brief Validate buffer sizes before execution
     *
     * Checks that all buffer allocations will fit within available memory
     * and that individual buffer sizes don't exceed engine limits.
     *
     * @throws std::runtime_error If validation fails with detailed message
     */
    void validate_buffer_sizes();

    /**
     * @brief Get engine statistics
     *
     * @return Map of engine_id → LifecycleStats
     */
    std::map<std::string, LifecycleStats> get_engine_stats() const;

private:
    orchestrator::DAGConfig dag_config_;
    CredentialManager& credential_manager_;
    OrchestratorConfig config_;
    Logger* logger_;

    EngineFactory engine_factory_;
    orchestrator::BufferManager buffer_manager_;
    std::map<std::string, std::unique_ptr<EngineLifecycleManager>> engines_;
    std::map<std::string, std::string> buffer_registry_;  // Maps output names to buffer IDs

    // Helper methods for error handling and recovery
    void initialize_engines();
    void allocate_buffers();
    ExecutionResult execute_with_retry(
        const std::string& node_id,
        const uint8_t* input_buffer,
        size_t input_size,
        uint8_t* output_buffer,
        size_t output_size,
        size_t attempt = 0
    );
    bool is_buffer_overflow_error(const std::string& error_message) const;
    std::string get_chunking_suggestion(const std::string& node_id, size_t required_size) const;
    bool is_optional_engine(const std::string& node_id) const;
    bool should_continue_after_error(const std::string& node_id, const std::string& error_message) const;
    void log_engine_failure(const std::string& node_id, const ExecutionResult& result);
    void record_partial_result(OrchestrationResult& result, const std::string& node_id, const ExecutionResult& engine_result);
};

} // namespace livecalc

#endif // LIVECALC_ORCHESTRATOR_HPP
