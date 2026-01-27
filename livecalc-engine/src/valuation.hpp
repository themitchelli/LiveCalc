#ifndef LIVECALC_VALUATION_HPP
#define LIVECALC_VALUATION_HPP

#include "policy.hpp"
#include "assumptions.hpp"
#include "scenario.hpp"
#include "projection.hpp"
#include <array>
#include <vector>

namespace livecalc {

// Result of nested stochastic valuation (scenarios × policies)
struct ValuationResult {
    // Summary statistics
    double mean_npv;                    // Mean NPV across all scenarios
    double std_dev;                     // Standard deviation of scenario NPVs
    std::array<double, 5> percentiles;  // P50, P75, P90, P95, P99
    double cte_95;                      // Conditional Tail Expectation at 95%

    // Distribution data for charting
    std::vector<double> scenario_npvs;  // NPV for each scenario (sum across policies)

    // Execution metrics
    double execution_time_ms;           // Total execution time in milliseconds
    int scenarios_failed;               // Number of scenarios that failed projection

    // Convenience accessors for percentiles
    double p50() const { return percentiles[0]; }
    double p75() const { return percentiles[1]; }
    double p90() const { return percentiles[2]; }
    double p95() const { return percentiles[3]; }
    double p99() const { return percentiles[4]; }

    // Default constructor
    ValuationResult();
};

// Configuration options for valuation
struct ValuationConfig {
    bool store_scenario_npvs;           // If true, store individual scenario NPVs
    double mortality_multiplier;        // Multiplier for mortality rates (default 1.0)
    double lapse_multiplier;            // Multiplier for lapse rates (default 1.0)
    double expense_multiplier;          // Multiplier for expenses (default 1.0)

    ValuationConfig();
};

// Run nested stochastic valuation
// Outer loop: scenarios
// Inner loop: policies
// Returns statistics over scenario distribution
//
// For each scenario:
//   1. Project all policies under that scenario
//   2. Sum NPVs to get total scenario NPV
// Then calculate statistics across all scenario NPVs
ValuationResult run_valuation(
    const std::vector<Policy>& policies,
    const MortalityTable& mortality,
    const LapseTable& lapse,
    const ExpenseAssumptions& expenses,
    const ScenarioSet& scenarios,
    const ValuationConfig& config = ValuationConfig()
);

// Overload accepting PolicySet for convenience
ValuationResult run_valuation(
    const PolicySet& policies,
    const MortalityTable& mortality,
    const LapseTable& lapse,
    const ExpenseAssumptions& expenses,
    const ScenarioSet& scenarios,
    const ValuationConfig& config = ValuationConfig()
);

} // namespace livecalc

#endif // LIVECALC_VALUATION_HPP
