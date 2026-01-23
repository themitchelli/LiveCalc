// Performance benchmark for nested stochastic valuation
// Not part of regular test suite - run manually

#include <iostream>
#include <iomanip>
#include "valuation.hpp"

using namespace livecalc;

// Create a simple mortality table based on AM92
MortalityTable create_realistic_mortality() {
    MortalityTable table;
    for (uint8_t age = 0; age <= 120; ++age) {
        // Simplified approximation of AM92-type mortality
        double male_qx = 0.0001 + 0.00001 * age * age;
        double female_qx = male_qx * 0.7;  // Female mortality lower
        if (male_qx > 1.0) male_qx = 1.0;
        if (female_qx > 1.0) female_qx = 1.0;
        table.set_qx(age, Gender::Male, male_qx);
        table.set_qx(age, Gender::Female, female_qx);
    }
    return table;
}

// Create typical lapse curve
LapseTable create_realistic_lapse() {
    LapseTable table;
    double lapse_rates[] = {
        0.15, 0.12, 0.10, 0.08, 0.07, 0.06, 0.05, 0.04, 0.04, 0.03,
        0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03,
        0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03,
        0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03,
        0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03
    };
    for (uint8_t year = 1; year <= 50; ++year) {
        table.set_rate(year, lapse_rates[year - 1]);
    }
    return table;
}

// Create realistic policy portfolio
std::vector<Policy> create_realistic_portfolio(size_t count) {
    std::vector<Policy> policies;
    policies.reserve(count);

    for (size_t i = 0; i < count; ++i) {
        Policy p;
        p.policy_id = static_cast<uint32_t>(i + 1);
        // Age distribution: mostly 30-60
        p.age = 25 + (i % 40);  // Ages 25-64
        p.gender = (i % 3 == 0) ? Gender::Female : Gender::Male;
        // Sum assured distribution: £50K - £500K
        p.sum_assured = 50000 + (i % 10) * 50000;
        // Premium roughly proportional to sum assured
        p.premium = p.sum_assured * 0.005 + 100;
        // Term distribution: 10-30 years
        p.term = 10 + (i % 21);  // Terms 10-30
        p.product_type = ProductType::Term;
        policies.push_back(p);
    }

    return policies;
}

void run_benchmark(size_t num_policies, size_t num_scenarios, uint64_t seed) {
    std::cout << "\n=== Benchmark: " << num_policies << " policies × "
              << num_scenarios << " scenarios ===" << std::endl;

    // Create assumptions
    MortalityTable mortality = create_realistic_mortality();
    LapseTable lapse = create_realistic_lapse();
    ExpenseAssumptions expenses(500, 50, 0.05, 100);

    // Create policies
    std::cout << "Creating " << num_policies << " policies..." << std::endl;
    std::vector<Policy> policies = create_realistic_portfolio(num_policies);

    // Generate scenarios
    std::cout << "Generating " << num_scenarios << " scenarios..." << std::endl;
    ScenarioGeneratorParams params(0.04, 0.0, 0.015, 0.0, 0.15);
    ScenarioSet scenarios = ScenarioSet::generate(num_scenarios, params, seed);

    // Run valuation
    std::cout << "Running valuation..." << std::endl;
    ValuationConfig config;
    config.store_scenario_npvs = false;  // Don't store for performance

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios, config);

    // Report results
    std::cout << std::fixed << std::setprecision(2);
    std::cout << "\nResults:" << std::endl;
    std::cout << "  Mean NPV:    £" << result.mean_npv / 1e6 << "M" << std::endl;
    std::cout << "  Std Dev:     £" << result.std_dev / 1e6 << "M" << std::endl;
    std::cout << "  P50 (Median):£" << result.p50() / 1e6 << "M" << std::endl;
    std::cout << "  P95:         £" << result.p95() / 1e6 << "M" << std::endl;
    std::cout << "  P99:         £" << result.p99() / 1e6 << "M" << std::endl;
    std::cout << "  CTE_95:      £" << result.cte_95 / 1e6 << "M" << std::endl;
    std::cout << "\nPerformance:" << std::endl;
    std::cout << "  Total time:  " << result.execution_time_ms << " ms" << std::endl;
    double projections = static_cast<double>(num_policies) * num_scenarios;
    std::cout << "  Projections: " << projections / 1e6 << "M" << std::endl;
    std::cout << "  Throughput:  " << projections / result.execution_time_ms * 1000 << " proj/sec" << std::endl;
}

int main() {
    std::cout << "LiveCalc Valuation Performance Benchmark" << std::endl;
    std::cout << "========================================" << std::endl;

    // Warm-up run
    run_benchmark(100, 100, 42);

    // Small scale
    run_benchmark(1000, 100, 42);

    // Medium scale
    run_benchmark(1000, 1000, 42);

    // Target scale (from acceptance criteria)
    run_benchmark(10000, 1000, 42);

    // Large scale (optional)
    run_benchmark(100000, 1000, 42);

    return 0;
}
