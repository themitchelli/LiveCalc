/**
 * @file engine_interface.hpp
 * @brief Abstract interface for pluggable calculation engines
 *
 * This interface enables the orchestrator to run different types of calculation
 * engines (ESG, projection, solver) in a unified pipeline using SharedArrayBuffer
 * for zero-copy data flow.
 *
 * Design Principles:
 * - Stateless: Each runChunk call should be independent
 * - Deterministic: Same inputs produce same outputs
 * - Thread-safe: Engine instances are not shared between threads
 * - Zero-copy: Data flows via SharedArrayBuffer (no serialization)
 */

#ifndef LIVECALC_ENGINE_INTERFACE_HPP
#define LIVECALC_ENGINE_INTERFACE_HPP

#include <string>
#include <map>
#include <vector>
#include <memory>
#include <stdexcept>
#include <cstdint>

namespace livecalc {

/**
 * @brief Engine metadata and capabilities
 */
struct EngineInfo {
    std::string name;                    ///< Human-readable engine name (e.g., "C++ Projection Engine")
    std::string version;                 ///< Semantic version string (e.g., "1.0.0")
    std::string engine_type;             ///< Type of engine: "esg", "projection", "solver"
    bool supports_assumptions_manager;   ///< Whether engine can resolve assumptions from AM
    size_t max_buffer_size;              ///< Maximum buffer size supported (bytes)

    EngineInfo(
        const std::string& name_,
        const std::string& version_,
        const std::string& engine_type_,
        bool supports_am_ = true,
        size_t max_buffer_size_ = 1024 * 1024 * 1024  // 1GB default
    ) : name(name_), version(version_), engine_type(engine_type_),
        supports_assumptions_manager(supports_am_), max_buffer_size(max_buffer_size_) {}
};

/**
 * @brief Execution result metadata returned by runChunk
 */
struct ExecutionResult {
    bool success;                        ///< True if execution completed successfully
    double execution_time_ms;            ///< Execution time in milliseconds
    size_t rows_processed;               ///< Number of rows/scenarios processed
    size_t bytes_written;                ///< Number of bytes written to output buffer
    std::vector<std::string> warnings;   ///< Non-fatal warnings during execution
    std::string error_message;           ///< Error message if success == false

    ExecutionResult() : success(true), execution_time_ms(0.0),
                       rows_processed(0), bytes_written(0) {}
};

/**
 * @brief Assumptions Manager credentials
 */
struct AMCredentials {
    std::string am_url;       ///< Assumptions Manager base URL
    std::string am_token;     ///< JWT authentication token
    std::string cache_dir;    ///< Local cache directory path

    AMCredentials() = default;
    AMCredentials(const std::string& url, const std::string& token, const std::string& cache)
        : am_url(url), am_token(token), cache_dir(cache) {}

    bool is_valid() const {
        return !am_url.empty() && !am_token.empty();
    }
};

/**
 * @brief Base exception for CalcEngine errors
 */
class CalcEngineError : public std::runtime_error {
public:
    explicit CalcEngineError(const std::string& message)
        : std::runtime_error(message) {}
};

/**
 * @brief Raised when engine initialization fails
 */
class InitializationError : public CalcEngineError {
public:
    explicit InitializationError(const std::string& message)
        : CalcEngineError("Initialization failed: " + message) {}
};

/**
 * @brief Raised when configuration is invalid
 */
class ConfigurationError : public CalcEngineError {
public:
    explicit ConfigurationError(const std::string& message)
        : CalcEngineError("Configuration error: " + message) {}
};

/**
 * @brief Raised when runChunk execution fails
 */
class ExecutionError : public CalcEngineError {
public:
    explicit ExecutionError(const std::string& message)
        : CalcEngineError("Execution failed: " + message) {}
};

/**
 * @brief Abstract interface for pluggable calculation engines
 *
 * All calculation engines (C++ Projection, Python ESG, Python Solver) implement
 * this interface to enable composition in the orchestrator DAG.
 *
 * Lifecycle:
 *   1. initialize(config, credentials) - set up engine with config and AM access
 *   2. runChunk(input_buffer, output_buffer) - execute computation (may be called multiple times)
 *   3. dispose() - clean up resources
 *
 * Usage Example:
 *   @code
 *   auto engine = std::make_unique<ProjectionEngine>();
 *   std::map<std::string, std::string> config = {...};
 *   AMCredentials creds("https://am.example.com", "jwt_token", "/cache");
 *
 *   engine->initialize(config, creds);
 *
 *   uint8_t* input = ...;   // Input buffer (policies or scenarios)
 *   uint8_t* output = ...;  // Output buffer (pre-allocated)
 *   size_t input_size = ...;
 *   size_t output_size = ...;
 *
 *   ExecutionResult result = engine->runChunk(input, input_size, output, output_size);
 *   if (!result.success) {
 *       std::cerr << "Error: " << result.error_message << std::endl;
 *   }
 *
 *   engine->dispose();
 *   @endcode
 */
class ICalcEngine {
public:
    virtual ~ICalcEngine() = default;

    /**
     * @brief Initialize the engine with configuration and credentials
     *
     * @param config Engine-specific configuration (key-value pairs)
     *               Example keys: "num_scenarios", "projection_years", "algorithm"
     * @param credentials Optional Assumptions Manager credentials
     *                    Pass nullptr if engine doesn't need AM access
     *
     * @throws InitializationError If initialization fails
     * @throws ConfigurationError If config is invalid
     */
    virtual void initialize(
        const std::map<std::string, std::string>& config,
        const AMCredentials* credentials = nullptr
    ) = 0;

    /**
     * @brief Get engine metadata and capabilities
     *
     * @return EngineInfo structure with engine details
     */
    virtual EngineInfo get_info() const = 0;

    /**
     * @brief Execute computation and write results to output buffer
     *
     * Data flows via SharedArrayBuffer (zero-copy within process):
     * - Input buffer: Policies, scenarios, or previous engine's output
     * - Output buffer: Pre-allocated by orchestrator, engine writes results
     *
     * Buffer Layout (documented per engine):
     * - Projection engine: input = policies, output = scenario NPVs
     * - ESG engine: input = nullptr (no dependencies), output = interest rate scenarios
     * - Solver engine: input = projection results, output = optimized parameters
     *
     * @param input_buffer Pointer to input data (nullptr for engines with no input dependencies)
     * @param input_size Size of input buffer in bytes (0 if input_buffer is nullptr)
     * @param output_buffer Pointer to pre-allocated output buffer
     * @param output_size Size of output buffer in bytes (must be sufficient for results)
     *
     * @return ExecutionResult with execution metadata and status
     *
     * @throws ExecutionError If computation fails
     *
     * @note This method must be thread-safe if called from multiple threads with different buffers
     * @note Engines must not modify input_buffer
     * @note Engines must validate output_size is sufficient before writing
     */
    virtual ExecutionResult runChunk(
        const uint8_t* input_buffer,
        size_t input_size,
        uint8_t* output_buffer,
        size_t output_size
    ) = 0;

    /**
     * @brief Clean up resources and free memory
     *
     * After calling dispose(), the engine must be re-initialized before use.
     * This method should be called when:
     * - Orchestration pipeline completes
     * - Engine is being replaced with a different configuration
     * - Process is shutting down
     *
     * @note This method must not throw exceptions
     */
    virtual void dispose() noexcept = 0;

    /**
     * @brief Check if the engine is initialized and ready
     *
     * @return true if engine is initialized, false otherwise
     */
    virtual bool is_initialized() const = 0;
};

/**
 * @brief Factory function type for creating engine instances
 *
 * Each engine type registers a factory function that the orchestrator
 * calls to instantiate engines.
 *
 * Example:
 *   @code
 *   std::unique_ptr<ICalcEngine> create_projection_engine() {
 *       return std::make_unique<ProjectionEngine>();
 *   }
 *   @endcode
 */
using EngineFactory = std::unique_ptr<ICalcEngine>(*)();

} // namespace livecalc

#endif // LIVECALC_ENGINE_INTERFACE_HPP
