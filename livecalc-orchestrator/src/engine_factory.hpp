/**
 * @file engine_factory.hpp
 * @brief Factory for creating calculation engines by type
 *
 * The EngineFactory provides a centralized way to instantiate different
 * calculation engine types (projection, ESG, solver) from configuration.
 *
 * Design Pattern: Factory Method with Registry
 * - Each engine type registers a factory function
 * - Orchestrator requests engines by string identifier
 * - Factory validates configuration and creates engine instances
 */

#ifndef LIVECALC_ENGINE_FACTORY_HPP
#define LIVECALC_ENGINE_FACTORY_HPP

#include "engine_interface.hpp"
#include <map>
#include <string>
#include <memory>
#include <functional>

namespace livecalc {

/**
 * @brief Engine type identifiers
 */
namespace EngineType {
    constexpr const char* PROJECTION = "cpp_projection";
    constexpr const char* PYTHON_ESG = "python_esg";
    constexpr const char* PYTHON_SOLVER = "python_solver";
}

/**
 * @brief Factory for creating engine instances
 *
 * Usage Example:
 *   @code
 *   EngineFactory factory;
 *   auto engine = factory.create_engine("cpp_projection");
 *   @endcode
 */
class EngineFactory {
public:
    /**
     * @brief Factory function type for creating engines
     */
    using FactoryFunction = std::function<std::unique_ptr<ICalcEngine>()>;

    /**
     * @brief Constructor - registers built-in engine types
     */
    EngineFactory();

    /**
     * @brief Create an engine instance by type
     *
     * @param engine_type Type identifier (e.g., "cpp_projection", "python_esg")
     * @return Unique pointer to engine instance
     *
     * @throws ConfigurationError If engine type is unknown
     */
    std::unique_ptr<ICalcEngine> create_engine(const std::string& engine_type);

    /**
     * @brief Register a custom engine type
     *
     * Allows external code to register new engine implementations.
     *
     * @param engine_type Type identifier (must be unique)
     * @param factory_fn Function that creates engine instances
     *
     * @throws ConfigurationError If engine_type already registered
     */
    void register_engine(const std::string& engine_type, FactoryFunction factory_fn);

    /**
     * @brief Check if engine type is registered
     *
     * @param engine_type Type identifier to check
     * @return true if engine type is registered
     */
    bool is_registered(const std::string& engine_type) const;

    /**
     * @brief Get list of registered engine types
     *
     * @return Vector of engine type identifiers
     */
    std::vector<std::string> list_engine_types() const;

private:
    std::map<std::string, FactoryFunction> registry_;

    // Built-in factory functions
    static std::unique_ptr<ICalcEngine> create_projection_engine();
    // Python engines will be registered when their bindings are available
};

} // namespace livecalc

#endif // LIVECALC_ENGINE_FACTORY_HPP
