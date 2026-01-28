#include "dag_config.hpp"
#include <set>
#include <queue>
#include <algorithm>
#include <sstream>

namespace livecalc {
namespace orchestrator {

void validate_dag_config(const DAGConfig& config) {
    // Check: At least one engine exists
    if (config.engines.empty()) {
        throw DAGConfigError("DAG must contain at least one engine");
    }

    // Check: All engine IDs are unique
    std::set<std::string> engine_ids;
    for (const auto& engine : config.engines) {
        if (engine.id.empty()) {
            throw DAGConfigError("Engine ID cannot be empty");
        }
        if (engine_ids.find(engine.id) != engine_ids.end()) {
            throw DAGConfigError("Duplicate engine ID: " + engine.id);
        }
        engine_ids.insert(engine.id);
    }

    // Check: All engine types are valid
    for (const auto& engine : config.engines) {
        if (engine.type.empty()) {
            throw DAGConfigError("Engine type cannot be empty for engine: " + engine.id);
        }
    }

    // Build map of available outputs (data sources + engine outputs)
    std::map<std::string, std::string> available_outputs;

    // Add data sources as available outputs
    for (const auto& pair : config.data_sources) {
        available_outputs[pair.first] = "data";
    }

    // Check: All inputs reference existing outputs
    // Process engines in topological order to track which outputs become available
    std::vector<std::string> execution_order;
    try {
        execution_order = compute_execution_order(config);
    } catch (const DAGConfigError& e) {
        // Re-throw with more context
        throw DAGConfigError(std::string("Failed to compute execution order: ") + e.what());
    }

    for (const std::string& engine_id : execution_order) {
        // Find the engine node
        const EngineNode* node = nullptr;
        for (const auto& engine : config.engines) {
            if (engine.id == engine_id) {
                node = &engine;
                break;
            }
        }

        if (!node) {
            throw DAGConfigError("Internal error: engine not found in execution order: " + engine_id);
        }

        // Validate all inputs are available
        for (const std::string& input : node->inputs) {
            auto [source_type, source_id] = resolve_input_reference(input);

            if (source_type == "data") {
                // Check data source exists
                if (available_outputs.find(source_id) == available_outputs.end()) {
                    throw DAGConfigError(
                        "Engine '" + node->id + "' references unknown data source: " + input
                    );
                }
            } else if (source_type == "engine") {
                // Parse engine_id.output_name
                size_t dot_pos = source_id.find('.');
                std::string dep_engine_id = source_id.substr(0, dot_pos);
                std::string output_name = (dot_pos != std::string::npos)
                    ? source_id.substr(dot_pos + 1)
                    : "";

                // Check dependency engine exists and has executed before this one
                std::string full_output = dep_engine_id + "." + output_name;
                if (available_outputs.find(full_output) == available_outputs.end()) {
                    throw DAGConfigError(
                        "Engine '" + node->id + "' references unavailable output: " + input
                    );
                }
            } else {
                throw DAGConfigError(
                    "Unknown source type for input: " + input + " (source_type: " + source_type + ")"
                );
            }
        }

        // Add this engine's outputs to available_outputs
        for (const std::string& output : node->outputs) {
            std::string full_output = node->id + "." + output;
            available_outputs[full_output] = "engine";
        }
    }

    // Check: Output configuration is valid
    if (config.output.type.empty()) {
        throw DAGConfigError("Output type cannot be empty");
    }
    if (config.output.path.empty()) {
        throw DAGConfigError("Output path cannot be empty");
    }
}

std::vector<std::string> compute_execution_order(const DAGConfig& config) {
    if (config.engines.empty()) {
        return {};
    }

    // Build dependency graph
    std::map<std::string, std::set<std::string>> dependencies; // engine_id -> set of engine_ids it depends on
    std::map<std::string, int> in_degree;                       // engine_id -> count of dependencies

    // Initialize maps
    for (const auto& engine : config.engines) {
        dependencies[engine.id] = std::set<std::string>();
        in_degree[engine.id] = 0;
    }

    // Build available outputs from data sources
    std::set<std::string> available_outputs;
    for (const auto& pair : config.data_sources) {
        available_outputs.insert(pair.first);
    }

    // Compute dependencies
    for (const auto& engine : config.engines) {
        for (const std::string& input : engine.inputs) {
            auto [source_type, source_id] = resolve_input_reference(input);

            if (source_type == "engine") {
                // Extract dependency engine ID
                size_t dot_pos = source_id.find('.');
                std::string dep_engine_id = source_id.substr(0, dot_pos);

                // Add dependency
                if (dependencies.find(dep_engine_id) != dependencies.end()) {
                    dependencies[engine.id].insert(dep_engine_id);
                }
            }
            // Data sources don't create dependencies (they're always available)
        }

        // Update in_degree
        in_degree[engine.id] = static_cast<int>(dependencies[engine.id].size());
    }

    // Kahn's algorithm for topological sort
    std::queue<std::string> ready_queue;
    std::vector<std::string> execution_order;

    // Start with engines that have no dependencies
    for (const auto& engine : config.engines) {
        if (in_degree[engine.id] == 0) {
            ready_queue.push(engine.id);
        }
    }

    while (!ready_queue.empty()) {
        std::string current_id = ready_queue.front();
        ready_queue.pop();
        execution_order.push_back(current_id);

        // Find the engine node
        const EngineNode* current_node = nullptr;
        for (const auto& engine : config.engines) {
            if (engine.id == current_id) {
                current_node = &engine;
                break;
            }
        }

        if (!current_node) {
            continue;
        }

        // Add this engine's outputs to available outputs
        for (const std::string& output : current_node->outputs) {
            available_outputs.insert(current_id + "." + output);
        }

        // Update in_degree for engines that depend on the current engine
        for (auto& pair : in_degree) {
            const std::string& dep_id = pair.first;
            if (dep_id == current_id) {
                continue;
            }

            if (dependencies[dep_id].find(current_id) != dependencies[dep_id].end()) {
                pair.second--;
                if (pair.second == 0) {
                    ready_queue.push(dep_id);
                }
            }
        }
    }

    // Check for circular dependencies
    if (execution_order.size() != config.engines.size()) {
        // Some engines not included = circular dependency
        std::ostringstream oss;
        oss << "Circular dependency detected. Engines not in execution order: ";
        for (const auto& engine : config.engines) {
            if (std::find(execution_order.begin(), execution_order.end(), engine.id)
                == execution_order.end()) {
                oss << engine.id << " ";
            }
        }
        throw DAGConfigError(oss.str());
    }

    return execution_order;
}

std::pair<std::string, std::string> resolve_input_reference(const std::string& input_ref) {
    if (input_ref.empty()) {
        throw DAGConfigError("Input reference cannot be empty");
    }

    size_t dot_pos = input_ref.find('.');
    if (dot_pos == std::string::npos) {
        // Simple reference: "policies" (data source)
        return {"data", input_ref};
    } else {
        // Qualified reference: "esg.scenarios" (engine output)
        return {"engine", input_ref};
    }
}

bool has_required_inputs(
    const EngineNode& node,
    const std::map<std::string, std::string>& available_outputs
) {
    for (const std::string& input : node.inputs) {
        auto [source_type, source_id] = resolve_input_reference(input);

        if (source_type == "data") {
            // Check data source is available
            if (available_outputs.find(source_id) == available_outputs.end()) {
                return false;
            }
        } else if (source_type == "engine") {
            // Check engine output is available
            if (available_outputs.find(source_id) == available_outputs.end()) {
                return false;
            }
        }
    }
    return true;
}

} // namespace orchestrator
} // namespace livecalc
