/**
 * @file projection_engine.hpp
 * @brief C++ Projection Engine implementation of ICalcEngine
 *
 * Wraps the livecalc-engine projection/valuation functionality in the
 * ICalcEngine interface for orchestrator integration.
 */

#ifndef LIVECALC_PROJECTION_ENGINE_HPP
#define LIVECALC_PROJECTION_ENGINE_HPP

#include "engine_interface.hpp"
#include "../../livecalc-engine/src/policy.hpp"
#include "../../livecalc-engine/src/assumption_set.hpp"
#include "../../livecalc-engine/src/scenario.hpp"
#include "../../livecalc-engine/src/valuation.hpp"
#include <memory>

namespace livecalc {

/**
 * @brief C++ Projection Engine
 *
 * Implements the ICalcEngine interface for actuarial projection calculations.
 *
 * Input Buffer Format (Policies):
 *   Struct layout (32 bytes per policy):
 *   - policy_id: uint64_t (8 bytes)
 *   - age: uint8_t (1 byte)
 *   - gender: uint8_t (1 byte, 0=Male, 1=Female)
 *   - padding: 6 bytes (alignment)
 *   - sum_assured: double (8 bytes)
 *   - premium: double (8 bytes)
 *   - term: uint32_t (4 bytes)
 *   - product_type: uint32_t (4 bytes)
 *
 * Output Buffer Format (Results):
 *   Struct layout (16 bytes per scenario):
 *   - scenario_id: uint32_t (4 bytes)
 *   - npv: double (8 bytes)
 *   - padding: 4 bytes (alignment)
 *
 * Configuration Keys:
 *   - "num_scenarios": Number of scenarios to run (default: 1000)
 *   - "projection_years": Projection horizon (default: 50)
 *   - "seed": Random seed for deterministic runs (default: 42)
 *   - "mortality_table": Path to mortality CSV or AM reference (required)
 *   - "lapse_table": Path to lapse CSV or AM reference (required)
 *   - "expenses": Path to expenses CSV/JSON or AM reference (required)
 */
class ProjectionEngine : public ICalcEngine {
public:
    ProjectionEngine();
    ~ProjectionEngine() override;

    // ICalcEngine interface implementation
    void initialize(
        const std::map<std::string, std::string>& config,
        const AMCredentials* credentials = nullptr
    ) override;

    EngineInfo get_info() const override;

    ExecutionResult runChunk(
        const uint8_t* input_buffer,
        size_t input_size,
        uint8_t* output_buffer,
        size_t output_size
    ) override;

    void dispose() noexcept override;

    bool is_initialized() const override { return initialized_; }

private:
    bool initialized_;
    std::map<std::string, std::string> config_;
    std::unique_ptr<AMCredentials> credentials_;

    // Assumption data
    std::unique_ptr<AssumptionSet> assumptions_;
    std::unique_ptr<ScenarioSet> scenarios_;

    // Configuration parameters
    size_t num_scenarios_;
    size_t projection_years_;
    uint32_t seed_;

    // Helper methods
    void validate_config(const std::map<std::string, std::string>& config);
    void load_assumptions();
    void generate_scenarios();
    PolicySet parse_policy_buffer(const uint8_t* buffer, size_t size);
    void write_results_buffer(const ValuationResult& result, uint8_t* buffer, size_t size);
};

} // namespace livecalc

#endif // LIVECALC_PROJECTION_ENGINE_HPP
