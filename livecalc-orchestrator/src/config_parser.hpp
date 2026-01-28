#ifndef LIVECALC_ORCHESTRATOR_CONFIG_PARSER_HPP
#define LIVECALC_ORCHESTRATOR_CONFIG_PARSER_HPP

#include "dag_config.hpp"
#include <string>
#include <fstream>
#include <memory>

namespace livecalc {
namespace orchestrator {

/**
 * @brief Exception thrown when config file parsing fails
 */
class ConfigParseError : public std::runtime_error {
public:
    explicit ConfigParseError(const std::string& message)
        : std::runtime_error(message) {}
};

/**
 * @brief Parses a DAG configuration from a JSON file
 *
 * @param file_path Path to the JSON configuration file
 * @return Parsed DAG configuration
 * @throws ConfigParseError if file cannot be read or JSON is invalid
 * @throws DAGConfigError if configuration is invalid
 */
DAGConfig parse_dag_config_from_file(const std::string& file_path);

/**
 * @brief Parses a DAG configuration from a JSON string
 *
 * @param json_string JSON configuration as string
 * @return Parsed DAG configuration
 * @throws ConfigParseError if JSON is invalid
 * @throws DAGConfigError if configuration is invalid
 */
DAGConfig parse_dag_config_from_string(const std::string& json_string);

/**
 * @brief Expands environment variable references in a string
 *
 * Supports syntax: ${VAR_NAME} or $VAR_NAME
 *
 * @param value String potentially containing variable references
 * @return String with variables expanded
 */
std::string expand_environment_variables(const std::string& value);

/**
 * @brief Resolves file paths relative to config file directory
 *
 * If path is relative, makes it relative to the directory containing the config file.
 * Absolute paths are returned unchanged.
 *
 * @param path File path to resolve
 * @param config_file_path Path to the configuration file
 * @return Resolved absolute path
 */
std::string resolve_relative_path(const std::string& path, const std::string& config_file_path);

} // namespace orchestrator
} // namespace livecalc

#endif // LIVECALC_ORCHESTRATOR_CONFIG_PARSER_HPP
