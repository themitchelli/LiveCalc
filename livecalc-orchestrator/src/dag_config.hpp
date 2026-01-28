#ifndef LIVECALC_ORCHESTRATOR_DAG_CONFIG_HPP
#define LIVECALC_ORCHESTRATOR_DAG_CONFIG_HPP

#include <string>
#include <vector>
#include <map>
#include <stdexcept>

namespace livecalc {
namespace orchestrator {

/**
 * @brief Exception thrown when DAG configuration is invalid
 */
class DAGConfigError : public std::runtime_error {
public:
    explicit DAGConfigError(const std::string& message)
        : std::runtime_error(message) {}
};

/**
 * @brief Represents a data source in the DAG (external input)
 */
struct DataSource {
    std::string id;           // e.g., "policies"
    std::string type;         // "parquet", "csv", "buffer"
    std::string path;         // File path or buffer reference

    DataSource() = default;
    DataSource(const std::string& id_, const std::string& type_, const std::string& path_)
        : id(id_), type(type_), path(path_) {}
};

/**
 * @brief Represents an engine node in the DAG
 */
struct EngineNode {
    std::string id;                                // Unique identifier, e.g., "esg", "projection"
    std::string type;                              // Engine type: "cpp_projection", "python_esg", etc.
    std::map<std::string, std::string> config;     // Engine-specific configuration
    std::vector<std::string> inputs;               // Input references: ["policies", "esg.scenarios"]
    std::vector<std::string> outputs;              // Output names: ["scenarios", "results"]

    EngineNode() = default;
    EngineNode(const std::string& id_, const std::string& type_)
        : id(id_), type(type_) {}
};

/**
 * @brief Represents output configuration for the DAG
 */
struct OutputConfig {
    std::string type;         // "parquet", "csv", "buffer"
    std::string path;         // File path or buffer reference

    OutputConfig() = default;
    OutputConfig(const std::string& type_, const std::string& path_)
        : type(type_), path(path_) {}
};

/**
 * @brief Represents AM credentials configuration
 */
struct AMCredentialsConfig {
    std::string url;          // AM URL
    std::string token;        // JWT token or variable reference
    std::string cache_dir;    // Cache directory path

    AMCredentialsConfig() = default;
    AMCredentialsConfig(const std::string& url_, const std::string& token_, const std::string& cache_dir_)
        : url(url_), token(token_), cache_dir(cache_dir_) {}

    bool is_valid() const {
        return !url.empty() && !token.empty();
    }
};

/**
 * @brief Represents the complete DAG configuration
 */
struct DAGConfig {
    std::string description;                           // Human-readable description
    std::vector<EngineNode> engines;                   // Engine nodes in the DAG
    std::map<std::string, DataSource> data_sources;    // External data inputs
    OutputConfig output;                               // Final output configuration
    AMCredentialsConfig am_credentials;                // Optional AM credentials

    DAGConfig() = default;
};

/**
 * @brief Validates a DAG configuration for correctness
 *
 * Validates:
 * - All engine IDs are unique
 * - All inputs reference existing outputs (from previous engines or data sources)
 * - No circular dependencies
 * - At least one engine exists
 * - Output configuration is valid
 *
 * @param config The DAG configuration to validate
 * @throws DAGConfigError if validation fails
 */
void validate_dag_config(const DAGConfig& config);

/**
 * @brief Computes topological execution order for engines
 *
 * Returns engine IDs in the order they should be executed,
 * ensuring all dependencies are met.
 *
 * @param config The DAG configuration
 * @return Vector of engine IDs in execution order
 * @throws DAGConfigError if circular dependencies detected
 */
std::vector<std::string> compute_execution_order(const DAGConfig& config);

/**
 * @brief Resolves an input reference to its source
 *
 * Input references can be:
 * - "input_name" (from data_sources)
 * - "engine_id.output_name" (from another engine)
 *
 * @param input_ref The input reference string
 * @return Pair of (source_type, source_id) where source_type is "data" or "engine"
 */
std::pair<std::string, std::string> resolve_input_reference(const std::string& input_ref);

/**
 * @brief Checks if an engine node has all required inputs available
 *
 * @param node The engine node to check
 * @param available_outputs Map of available outputs (from data sources and completed engines)
 * @return true if all inputs are available, false otherwise
 */
bool has_required_inputs(
    const EngineNode& node,
    const std::map<std::string, std::string>& available_outputs
);

} // namespace orchestrator
} // namespace livecalc

#endif // LIVECALC_ORCHESTRATOR_DAG_CONFIG_HPP
