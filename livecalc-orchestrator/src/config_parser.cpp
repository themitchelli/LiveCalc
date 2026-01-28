#include "config_parser.hpp"
#include <nlohmann/json.hpp>
#include <fstream>
#include <sstream>
#include <cstdlib>
#include <filesystem>

using json = nlohmann::json;
namespace fs = std::filesystem;

namespace livecalc {
namespace orchestrator {

std::string expand_environment_variables(const std::string& value) {
    std::string result = value;
    size_t pos = 0;

    while ((pos = result.find('$', pos)) != std::string::npos) {
        size_t start = pos;
        pos++; // Skip '$'

        // Check for ${VAR} syntax
        bool braces = false;
        if (pos < result.size() && result[pos] == '{') {
            braces = true;
            pos++; // Skip '{'
        }

        // Extract variable name
        size_t name_start = pos;
        while (pos < result.size() &&
               (std::isalnum(result[pos]) || result[pos] == '_')) {
            pos++;
        }

        if (braces && pos < result.size() && result[pos] == '}') {
            pos++; // Skip '}'
        }

        std::string var_name = result.substr(name_start, pos - name_start - (braces ? 1 : 0));

        // Get environment variable value
        const char* env_value = std::getenv(var_name.c_str());
        std::string replacement = env_value ? env_value : "";

        // Replace in string
        size_t end = pos;
        result.replace(start, end - start, replacement);
        pos = start + replacement.size();
    }

    return result;
}

std::string resolve_relative_path(const std::string& path, const std::string& config_file_path) {
    fs::path p(path);

    if (p.is_absolute()) {
        return path;
    }

    // Get directory containing config file
    fs::path config_dir = fs::path(config_file_path).parent_path();

    // Resolve relative to config directory
    fs::path resolved = config_dir / p;
    return resolved.string();
}

DAGConfig parse_dag_config_from_string(const std::string& json_string) {
    DAGConfig config;

    try {
        json j = json::parse(json_string);

        // Parse description (optional)
        if (j.contains("description")) {
            config.description = j["description"].get<std::string>();
        }

        // Parse engines (required)
        if (!j.contains("engines")) {
            throw ConfigParseError("Missing required field: engines");
        }

        for (const auto& engine_json : j["engines"]) {
            EngineNode node;

            if (!engine_json.contains("id")) {
                throw ConfigParseError("Engine missing required field: id");
            }
            node.id = engine_json["id"].get<std::string>();

            if (!engine_json.contains("type")) {
                throw ConfigParseError("Engine '" + node.id + "' missing required field: type");
            }
            node.type = engine_json["type"].get<std::string>();

            // Parse config (optional map of string -> string)
            if (engine_json.contains("config")) {
                for (auto it = engine_json["config"].begin(); it != engine_json["config"].end(); ++it) {
                    std::string value = it.value().is_string()
                        ? it.value().get<std::string>()
                        : it.value().dump();
                    node.config[it.key()] = expand_environment_variables(value);
                }
            }

            // Parse inputs (optional array of strings)
            if (engine_json.contains("inputs")) {
                for (const auto& input : engine_json["inputs"]) {
                    node.inputs.push_back(input.get<std::string>());
                }
            }

            // Parse outputs (optional array of strings)
            if (engine_json.contains("outputs")) {
                for (const auto& output : engine_json["outputs"]) {
                    node.outputs.push_back(output.get<std::string>());
                }
            }

            config.engines.push_back(node);
        }

        // Parse data_sources (optional)
        if (j.contains("data_sources")) {
            for (auto it = j["data_sources"].begin(); it != j["data_sources"].end(); ++it) {
                DataSource source;
                source.id = it.key();

                if (it.value().contains("type")) {
                    source.type = it.value()["type"].get<std::string>();
                }
                if (it.value().contains("path")) {
                    source.path = expand_environment_variables(
                        it.value()["path"].get<std::string>()
                    );
                }

                config.data_sources[source.id] = source;
            }
        }

        // Parse output (optional)
        if (j.contains("output")) {
            if (j["output"].contains("type")) {
                config.output.type = j["output"]["type"].get<std::string>();
            }
            if (j["output"].contains("path")) {
                config.output.path = expand_environment_variables(
                    j["output"]["path"].get<std::string>()
                );
            }
        }

        // Parse am_credentials (optional)
        if (j.contains("am_credentials")) {
            if (j["am_credentials"].contains("url")) {
                config.am_credentials.url = expand_environment_variables(
                    j["am_credentials"]["url"].get<std::string>()
                );
            }
            if (j["am_credentials"].contains("token")) {
                config.am_credentials.token = expand_environment_variables(
                    j["am_credentials"]["token"].get<std::string>()
                );
            }
            if (j["am_credentials"].contains("cache_dir")) {
                config.am_credentials.cache_dir = expand_environment_variables(
                    j["am_credentials"]["cache_dir"].get<std::string>()
                );
            }
        }

    } catch (const json::parse_error& e) {
        throw ConfigParseError(std::string("JSON parse error: ") + e.what());
    } catch (const json::type_error& e) {
        throw ConfigParseError(std::string("JSON type error: ") + e.what());
    }

    // Validate configuration
    validate_dag_config(config);

    return config;
}

DAGConfig parse_dag_config_from_file(const std::string& file_path) {
    // Read file
    std::ifstream file(file_path);
    if (!file.is_open()) {
        throw ConfigParseError("Failed to open config file: " + file_path);
    }

    std::ostringstream buffer;
    buffer << file.rdbuf();
    std::string json_string = buffer.str();

    // Parse JSON
    DAGConfig config = parse_dag_config_from_string(json_string);

    // Resolve relative paths
    for (auto& pair : config.data_sources) {
        if (!pair.second.path.empty() && pair.second.type != "buffer") {
            pair.second.path = resolve_relative_path(pair.second.path, file_path);
        }
    }

    if (!config.output.path.empty() && config.output.type != "buffer") {
        config.output.path = resolve_relative_path(config.output.path, file_path);
    }

    // Resolve relative paths in engine configs
    for (auto& engine : config.engines) {
        for (auto& pair : engine.config) {
            // If the value looks like a file path (contains .csv, .parquet, etc.), resolve it
            const std::string& value = pair.second;
            if (value.find(".csv") != std::string::npos ||
                value.find(".parquet") != std::string::npos ||
                value.find(".json") != std::string::npos) {
                // Don't resolve if it's an assumptions:// reference
                if (value.find("assumptions://") == std::string::npos) {
                    pair.second = resolve_relative_path(value, file_path);
                }
            }
        }
    }

    return config;
}

} // namespace orchestrator
} // namespace livecalc
