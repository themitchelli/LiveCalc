#include "valuation.hpp"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <numeric>
#include <stdexcept>
#include <iostream>
#ifdef HAVE_OPENMP
#include <omp.h>
#endif

namespace livecalc {

// ============================================================================
// ValuationResult Implementation
// ============================================================================

ValuationResult::ValuationResult()
    : mean_npv(0.0),
      std_dev(0.0),
      percentiles{0.0, 0.0, 0.0, 0.0, 0.0},
      cte_95(0.0),
      execution_time_ms(0.0),
      scenarios_failed(0) {}

// ============================================================================
// ValuationConfig Implementation
// ============================================================================

ValuationConfig::ValuationConfig()
    : store_scenario_npvs(true),
      mortality_multiplier(1.0),
      lapse_multiplier(1.0),
      expense_multiplier(1.0) {}

// ============================================================================
// Statistics Helper Functions
// ============================================================================

namespace {

// Calculate mean of a vector
double calculate_mean(const std::vector<double>& values) {
    if (values.empty()) {
        return 0.0;
    }
    double sum = std::accumulate(values.begin(), values.end(), 0.0);
    return sum / static_cast<double>(values.size());
}

// Calculate standard deviation (population std dev)
double calculate_std_dev(const std::vector<double>& values, double mean) {
    if (values.size() < 2) {
        return 0.0;
    }
    double sum_sq_diff = 0.0;
    for (double v : values) {
        double diff = v - mean;
        sum_sq_diff += diff * diff;
    }
    return std::sqrt(sum_sq_diff / static_cast<double>(values.size()));
}

// Calculate percentile using linear interpolation
// values must be sorted in ascending order
// p is the percentile (0-100)
double calculate_percentile(const std::vector<double>& sorted_values, double p) {
    if (sorted_values.empty()) {
        return 0.0;
    }
    if (sorted_values.size() == 1) {
        return sorted_values[0];
    }

    // Convert percentile to index position
    double n = static_cast<double>(sorted_values.size());
    double pos = (p / 100.0) * (n - 1);

    size_t lower_idx = static_cast<size_t>(std::floor(pos));
    size_t upper_idx = static_cast<size_t>(std::ceil(pos));

    if (lower_idx == upper_idx || upper_idx >= sorted_values.size()) {
        return sorted_values[lower_idx];
    }

    // Linear interpolation
    double frac = pos - static_cast<double>(lower_idx);
    return sorted_values[lower_idx] * (1.0 - frac) + sorted_values[upper_idx] * frac;
}

// Calculate Conditional Tail Expectation (CTE) at given percentile
// CTE_p = average of values above percentile p
// For CTE_95, we average the worst 5% of scenarios (highest losses, i.e., lowest NPVs)
// Values must be sorted in ascending order
double calculate_cte(const std::vector<double>& sorted_values, double p) {
    if (sorted_values.empty()) {
        return 0.0;
    }

    // CTE at p% = average of values in the lower (100-p)% tail
    // For CTE_95, we want the average of the lowest 5%
    double tail_proportion = (100.0 - p) / 100.0;
    size_t tail_count = static_cast<size_t>(std::ceil(sorted_values.size() * tail_proportion));

    if (tail_count == 0) {
        tail_count = 1;  // At minimum, include 1 value
    }

    double sum = 0.0;
    for (size_t i = 0; i < tail_count; ++i) {
        sum += sorted_values[i];
    }
    return sum / static_cast<double>(tail_count);
}

} // anonymous namespace

// ============================================================================
// Valuation Implementation
// ============================================================================

ValuationResult run_valuation(
    const std::vector<Policy>& policies,
    const MortalityTable& mortality,
    const LapseTable& lapse,
    const ExpenseAssumptions& expenses,
    const ScenarioSet& scenarios,
    const ValuationConfig& config)
{
    ValuationResult result;

    // Start timing
    auto start_time = std::chrono::high_resolution_clock::now();

    // Handle edge cases
    if (scenarios.empty() || policies.empty()) {
        auto end_time = std::chrono::high_resolution_clock::now();
        result.execution_time_ms = std::chrono::duration<double, std::milli>(
            end_time - start_time).count();
        return result;
    }

    // Set up projection config
    ProjectionConfig proj_config;
    proj_config.detailed_cashflows = false;  // We only need NPV
    proj_config.mortality_multiplier = config.mortality_multiplier;
    proj_config.lapse_multiplier = config.lapse_multiplier;
    proj_config.expense_multiplier = config.expense_multiplier;

    // Allocate space for scenario NPVs and failure tracking
    std::vector<double> scenario_npvs;
    scenario_npvs.resize(scenarios.size(), 0.0);
    std::vector<bool> scenario_failed;
    scenario_failed.resize(scenarios.size(), false);

    int failed_count = 0;

    // Outer loop: scenarios
    // Each scenario is independent, but we keep the outer loop sequential for simplicity
    // and parallelize the inner loop (policies) which is the dominant computation
    for (size_t s = 0; s < scenarios.size(); ++s) {
        const Scenario& scenario = scenarios.get(s);

        // Inner loop: policies (PARALLELIZED)
        // Sum NPVs across all policies for this scenario
        double scenario_total_npv = 0.0;
        bool scenario_has_error = false;

        try {
#ifdef HAVE_OPENMP
            // Parallelize policy loop with OpenMP
            // Use reduction to sum NPVs efficiently across threads
            #pragma omp parallel for reduction(+:scenario_total_npv) schedule(dynamic, 100)
            for (size_t p = 0; p < policies.size(); ++p) {
                try {
                    const Policy& policy = policies[p];
                    ProjectionResult proj_result = project_policy(
                        policy, mortality, lapse, expenses, scenario, proj_config);
                    scenario_total_npv += proj_result.npv;
                } catch (const std::exception& e) {
                    // Log error but continue processing other policies
                    // We can't safely write to shared state from parallel region,
                    // so we'll mark the scenario as failed after the parallel region
                    #pragma omp critical
                    {
                        std::cerr << "Warning: Policy projection failed (policy "
                                  << policies[p].policy_id << ", scenario " << s
                                  << "): " << e.what() << std::endl;
                        scenario_has_error = true;
                    }
                }
            }
#else
            // Single-threaded fallback when OpenMP not available
            for (const Policy& policy : policies) {
                try {
                    ProjectionResult proj_result = project_policy(
                        policy, mortality, lapse, expenses, scenario, proj_config);
                    scenario_total_npv += proj_result.npv;
                } catch (const std::exception& e) {
                    std::cerr << "Warning: Policy projection failed (policy "
                              << policy.policy_id << ", scenario " << s
                              << "): " << e.what() << std::endl;
                    scenario_has_error = true;
                }
            }
#endif

            scenario_npvs[s] = scenario_total_npv;

            if (scenario_has_error) {
                scenario_failed[s] = true;
                failed_count++;
            }

        } catch (const std::exception& e) {
            // Entire scenario failed
            std::cerr << "Error: Scenario " << s << " failed: " << e.what() << std::endl;
            scenario_npvs[s] = 0.0;
            scenario_failed[s] = true;
            failed_count++;
        }
    }

    result.scenarios_failed = failed_count;

    // Calculate statistics (excluding failed scenarios for accuracy)
    std::vector<double> valid_scenario_npvs;
    valid_scenario_npvs.reserve(scenarios.size() - failed_count);
    for (size_t s = 0; s < scenarios.size(); ++s) {
        if (!scenario_failed[s]) {
            valid_scenario_npvs.push_back(scenario_npvs[s]);
        }
    }

    // Only calculate statistics if we have valid scenarios
    if (!valid_scenario_npvs.empty()) {
        // Mean
        result.mean_npv = calculate_mean(valid_scenario_npvs);

        // Standard deviation
        result.std_dev = calculate_std_dev(valid_scenario_npvs, result.mean_npv);

        // Sort for percentile calculations
        std::vector<double> sorted_npvs = valid_scenario_npvs;
        std::sort(sorted_npvs.begin(), sorted_npvs.end());

        // Percentiles: P50, P75, P90, P95, P99
        result.percentiles[0] = calculate_percentile(sorted_npvs, 50.0);
        result.percentiles[1] = calculate_percentile(sorted_npvs, 75.0);
        result.percentiles[2] = calculate_percentile(sorted_npvs, 90.0);
        result.percentiles[3] = calculate_percentile(sorted_npvs, 95.0);
        result.percentiles[4] = calculate_percentile(sorted_npvs, 99.0);

        // CTE at 95% (average of worst 5%)
        result.cte_95 = calculate_cte(sorted_npvs, 95.0);
    }

    // Store scenario NPVs if requested
    if (config.store_scenario_npvs) {
        result.scenario_npvs = std::move(scenario_npvs);
    }

    // End timing
    auto end_time = std::chrono::high_resolution_clock::now();
    result.execution_time_ms = std::chrono::duration<double, std::milli>(
        end_time - start_time).count();

    return result;
}

// Overload accepting PolicySet
ValuationResult run_valuation(
    const PolicySet& policies,
    const MortalityTable& mortality,
    const LapseTable& lapse,
    const ExpenseAssumptions& expenses,
    const ScenarioSet& scenarios,
    const ValuationConfig& config)
{
    return run_valuation(policies.policies(), mortality, lapse, expenses, scenarios, config);
}

} // namespace livecalc
