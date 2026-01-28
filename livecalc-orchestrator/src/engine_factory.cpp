/**
 * @file engine_factory.cpp
 * @brief Implementation of EngineFactory
 */

#include "engine_factory.hpp"
#include "projection_engine.hpp"
#include <stdexcept>

namespace livecalc {

EngineFactory::EngineFactory() {
    // Register built-in engine types
    registry_[EngineType::PROJECTION] = create_projection_engine;

    // Python engines would be registered here when available:
    // registry_[EngineType::PYTHON_ESG] = create_python_esg_engine;
    // registry_[EngineType::PYTHON_SOLVER] = create_python_solver_engine;
}

std::unique_ptr<ICalcEngine> EngineFactory::create_engine(const std::string& engine_type) {
    auto it = registry_.find(engine_type);
    if (it == registry_.end()) {
        throw ConfigurationError("Unknown engine type: " + engine_type +
                                ". Available types: " +
                                [this]() {
                                    std::string types;
                                    for (const auto& pair : registry_) {
                                        if (!types.empty()) types += ", ";
                                        types += pair.first;
                                    }
                                    return types;
                                }());
    }

    return it->second();
}

void EngineFactory::register_engine(const std::string& engine_type, FactoryFunction factory_fn) {
    if (registry_.find(engine_type) != registry_.end()) {
        throw ConfigurationError("Engine type already registered: " + engine_type);
    }
    registry_[engine_type] = std::move(factory_fn);
}

bool EngineFactory::is_registered(const std::string& engine_type) const {
    return registry_.find(engine_type) != registry_.end();
}

std::vector<std::string> EngineFactory::list_engine_types() const {
    std::vector<std::string> types;
    types.reserve(registry_.size());
    for (const auto& pair : registry_) {
        types.push_back(pair.first);
    }
    return types;
}

// Built-in factory functions
std::unique_ptr<ICalcEngine> EngineFactory::create_projection_engine() {
    return std::make_unique<ProjectionEngine>();
}

} // namespace livecalc
