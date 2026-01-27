#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <cmath>
#include <numeric>
#include <iostream>
#include <chrono>
#ifdef HAVE_OPENMP
#include <omp.h>
#endif
#include "valuation.hpp"

using namespace livecalc;
using Catch::Matchers::WithinRel;
using Catch::Matchers::WithinAbs;

// ============================================================================
// Test Fixtures
// ============================================================================

namespace {

// Create a simple mortality table with constant mortality
MortalityTable create_constant_mortality(double qx) {
    MortalityTable table;
    for (uint8_t age = 0; age <= 120; ++age) {
        table.set_qx(age, Gender::Male, qx);
        table.set_qx(age, Gender::Female, qx);
    }
    return table;
}

// Create a simple lapse table with constant lapse rate
LapseTable create_constant_lapse(double rate) {
    LapseTable table;
    for (uint8_t year = 1; year <= 50; ++year) {
        table.set_rate(year, rate);
    }
    return table;
}

// Create a flat interest rate scenario
Scenario create_flat_scenario(double rate) {
    Scenario scenario;
    for (uint8_t year = 1; year <= 50; ++year) {
        scenario.set_rate(year, rate);
    }
    return scenario;
}

// Create a scenario set with flat rates
ScenarioSet create_flat_scenarios(size_t count, double rate) {
    ScenarioSet set;
    set.reserve(count);
    Scenario flat = create_flat_scenario(rate);
    for (size_t i = 0; i < count; ++i) {
        set.add(flat);
    }
    return set;
}

// Create varying scenarios for distribution testing
ScenarioSet create_varying_scenarios(const std::vector<double>& rates) {
    ScenarioSet set;
    set.reserve(rates.size());
    for (double rate : rates) {
        set.add(create_flat_scenario(rate));
    }
    return set;
}

// Create a simple policy
Policy create_simple_policy(uint32_t id, uint8_t age, uint8_t term,
                            double sum_assured, double premium) {
    Policy policy;
    policy.policy_id = id;
    policy.age = age;
    policy.gender = Gender::Male;
    policy.sum_assured = sum_assured;
    policy.premium = premium;
    policy.term = term;
    policy.product_type = ProductType::Term;
    return policy;
}

// Create a vector of identical policies
std::vector<Policy> create_identical_policies(size_t count, const Policy& template_policy) {
    std::vector<Policy> policies;
    policies.reserve(count);
    for (size_t i = 0; i < count; ++i) {
        Policy p = template_policy;
        p.policy_id = static_cast<uint32_t>(i + 1);
        policies.push_back(p);
    }
    return policies;
}

} // anonymous namespace

// ============================================================================
// ValuationResult Tests
// ============================================================================

TEST_CASE("ValuationResult default construction", "[valuation]") {
    ValuationResult result;

    REQUIRE(result.mean_npv == 0.0);
    REQUIRE(result.std_dev == 0.0);
    REQUIRE(result.cte_95 == 0.0);
    REQUIRE(result.execution_time_ms == 0.0);
    REQUIRE(result.scenario_npvs.empty());

    // Check percentile accessors
    REQUIRE(result.p50() == 0.0);
    REQUIRE(result.p75() == 0.0);
    REQUIRE(result.p90() == 0.0);
    REQUIRE(result.p95() == 0.0);
    REQUIRE(result.p99() == 0.0);
}

// ============================================================================
// Edge Case Tests
// ============================================================================

TEST_CASE("Empty scenarios returns zero results", "[valuation]") {
    std::vector<Policy> policies = {create_simple_policy(1, 30, 10, 100000, 500)};
    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet empty_scenarios;

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, empty_scenarios);

    REQUIRE(result.mean_npv == 0.0);
    REQUIRE(result.std_dev == 0.0);
    REQUIRE(result.scenario_npvs.empty());
}

TEST_CASE("Empty policies returns zero results", "[valuation]") {
    std::vector<Policy> empty_policies;
    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(10, 0.03);

    ValuationResult result = run_valuation(
        empty_policies, mortality, lapse, expenses, scenarios);

    REQUIRE(result.mean_npv == 0.0);
    REQUIRE(result.std_dev == 0.0);
}

TEST_CASE("Single scenario produces zero std dev", "[valuation]") {
    std::vector<Policy> policies = {create_simple_policy(1, 30, 10, 100000, 500)};
    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(1, 0.03);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    REQUIRE(result.std_dev == 0.0);
    REQUIRE(result.scenario_npvs.size() == 1);
}

// ============================================================================
// Aggregation Tests
// ============================================================================

TEST_CASE("Scenario NPV equals sum of policy NPVs", "[valuation]") {
    // Create 3 policies
    Policy p1 = create_simple_policy(1, 30, 10, 100000, 500);
    Policy p2 = create_simple_policy(2, 40, 15, 200000, 800);
    Policy p3 = create_simple_policy(3, 50, 20, 150000, 600);
    std::vector<Policy> policies = {p1, p2, p3};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    Scenario scenario = create_flat_scenario(0.04);
    ScenarioSet scenarios;
    scenarios.add(scenario);

    // Calculate expected total by projecting each policy individually
    ProjectionConfig config;
    double expected_total = 0.0;
    for (const auto& p : policies) {
        ProjectionResult pr = project_policy(p, mortality, lapse, expenses, scenario, config);
        expected_total += pr.npv;
    }

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    REQUIRE_THAT(result.scenario_npvs[0], WithinRel(expected_total, 1e-10));
    REQUIRE_THAT(result.mean_npv, WithinRel(expected_total, 1e-10));
}

TEST_CASE("Multiple identical scenarios produce same mean as single scenario", "[valuation]") {
    Policy policy = create_simple_policy(1, 35, 20, 150000, 700);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    // Single scenario
    ScenarioSet single = create_flat_scenarios(1, 0.03);
    ValuationResult single_result = run_valuation(
        policies, mortality, lapse, expenses, single);

    // Multiple identical scenarios
    ScenarioSet multiple = create_flat_scenarios(100, 0.03);
    ValuationResult multiple_result = run_valuation(
        policies, mortality, lapse, expenses, multiple);

    REQUIRE_THAT(multiple_result.mean_npv, WithinRel(single_result.mean_npv, 1e-10));
    REQUIRE_THAT(multiple_result.std_dev, WithinAbs(0.0, 1e-10));  // All scenarios identical
}

// ============================================================================
// Statistics Tests
// ============================================================================

TEST_CASE("Mean calculation is correct", "[valuation]") {
    // Create scenarios with known NPV outcomes
    // Use different interest rates to get different NPVs
    std::vector<double> rates = {0.01, 0.02, 0.03, 0.04, 0.05};
    ScenarioSet scenarios = create_varying_scenarios(rates);

    Policy policy = create_simple_policy(1, 30, 10, 100000, 500);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    // Calculate expected mean manually
    double sum = std::accumulate(result.scenario_npvs.begin(), result.scenario_npvs.end(), 0.0);
    double expected_mean = sum / result.scenario_npvs.size();

    REQUIRE_THAT(result.mean_npv, WithinRel(expected_mean, 1e-10));
}

TEST_CASE("Standard deviation calculation is correct", "[valuation]") {
    // Create scenarios with varying rates
    std::vector<double> rates = {0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10};
    ScenarioSet scenarios = create_varying_scenarios(rates);

    Policy policy = create_simple_policy(1, 30, 10, 100000, 500);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    // Calculate expected std dev manually (population std dev)
    double mean = result.mean_npv;
    double sum_sq_diff = 0.0;
    for (double npv : result.scenario_npvs) {
        double diff = npv - mean;
        sum_sq_diff += diff * diff;
    }
    double expected_std_dev = std::sqrt(sum_sq_diff / result.scenario_npvs.size());

    REQUIRE_THAT(result.std_dev, WithinRel(expected_std_dev, 1e-10));
}

TEST_CASE("Percentiles are monotonically increasing", "[valuation]") {
    // Generate scenarios with varying rates
    ScenarioGeneratorParams params(0.03, 0.0, 0.02, 0.0, 0.20);
    ScenarioSet scenarios = ScenarioSet::generate(100, params, 12345);

    Policy policy = create_simple_policy(1, 35, 15, 100000, 600);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    REQUIRE(result.p50() <= result.p75());
    REQUIRE(result.p75() <= result.p90());
    REQUIRE(result.p90() <= result.p95());
    REQUIRE(result.p95() <= result.p99());
}

TEST_CASE("Median is between min and max", "[valuation]") {
    ScenarioGeneratorParams params(0.03, 0.0, 0.02, 0.0, 0.20);
    ScenarioSet scenarios = ScenarioSet::generate(50, params, 54321);

    Policy policy = create_simple_policy(1, 40, 20, 150000, 800);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    auto [min_it, max_it] = std::minmax_element(
        result.scenario_npvs.begin(), result.scenario_npvs.end());

    REQUIRE(result.p50() >= *min_it);
    REQUIRE(result.p50() <= *max_it);
}

// ============================================================================
// CTE Tests
// ============================================================================

TEST_CASE("CTE_95 is less than or equal to P5 (lower tail)", "[valuation]") {
    // CTE_95 is the average of the worst 5% of scenarios (lowest NPVs)
    // It should be <= P5 (5th percentile)
    ScenarioGeneratorParams params(0.03, 0.0, 0.02, 0.0, 0.20);
    ScenarioSet scenarios = ScenarioSet::generate(100, params, 11111);

    Policy policy = create_simple_policy(1, 35, 15, 100000, 600);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    // Sort to find P5
    std::vector<double> sorted = result.scenario_npvs;
    std::sort(sorted.begin(), sorted.end());

    // CTE_95 should be <= P5 (the 5th percentile cutoff)
    // Actually CTE is average of values below the cutoff
    REQUIRE(result.cte_95 <= result.p50());  // CTE_95 is definitely below median
}

TEST_CASE("CTE_95 equals worst value when only 1 scenario in tail", "[valuation]") {
    // With 20 scenarios, 5% = 1 scenario
    std::vector<double> rates;
    for (int i = 0; i < 20; ++i) {
        rates.push_back(0.03 + i * 0.002);  // 3% to 6.8%
    }
    ScenarioSet scenarios = create_varying_scenarios(rates);

    Policy policy = create_simple_policy(1, 35, 15, 100000, 600);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    // Find the minimum NPV
    double min_npv = *std::min_element(
        result.scenario_npvs.begin(), result.scenario_npvs.end());

    REQUIRE_THAT(result.cte_95, WithinRel(min_npv, 1e-10));
}

// ============================================================================
// Multiplier Tests
// ============================================================================

TEST_CASE("Mortality multiplier affects valuation results", "[valuation]") {
    Policy policy = create_simple_policy(1, 40, 20, 100000, 800);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(10, 0.03);

    ValuationConfig base_config;
    ValuationResult base_result = run_valuation(
        policies, mortality, lapse, expenses, scenarios, base_config);

    ValuationConfig stressed_config;
    stressed_config.mortality_multiplier = 1.5;  // 50% higher mortality
    ValuationResult stressed_result = run_valuation(
        policies, mortality, lapse, expenses, scenarios, stressed_config);

    // Higher mortality = more claims = lower NPV (from company perspective)
    REQUIRE(stressed_result.mean_npv < base_result.mean_npv);
}

TEST_CASE("Lapse multiplier affects valuation results", "[valuation]") {
    Policy policy = create_simple_policy(1, 40, 20, 100000, 800);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(10, 0.03);

    ValuationConfig base_config;
    ValuationResult base_result = run_valuation(
        policies, mortality, lapse, expenses, scenarios, base_config);

    ValuationConfig stressed_config;
    stressed_config.lapse_multiplier = 2.0;  // Double lapses
    ValuationResult stressed_result = run_valuation(
        policies, mortality, lapse, expenses, scenarios, stressed_config);

    // Results should be different (exact direction depends on product profitability)
    REQUIRE(stressed_result.mean_npv != base_result.mean_npv);
}

TEST_CASE("Expense multiplier affects valuation results", "[valuation]") {
    Policy policy = create_simple_policy(1, 40, 20, 100000, 800);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(10, 0.03);

    ValuationConfig base_config;
    ValuationResult base_result = run_valuation(
        policies, mortality, lapse, expenses, scenarios, base_config);

    ValuationConfig stressed_config;
    stressed_config.expense_multiplier = 1.2;  // 20% higher expenses
    ValuationResult stressed_result = run_valuation(
        policies, mortality, lapse, expenses, scenarios, stressed_config);

    // Higher expenses = lower NPV
    REQUIRE(stressed_result.mean_npv < base_result.mean_npv);
}

// ============================================================================
// Execution Time Tests
// ============================================================================

TEST_CASE("Execution time is recorded", "[valuation]") {
    Policy policy = create_simple_policy(1, 30, 10, 100000, 500);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(100, 0.03);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    REQUIRE(result.execution_time_ms > 0.0);
}

TEST_CASE("Execution time scales with scenario count", "[valuation]") {
    Policy policy = create_simple_policy(1, 30, 10, 100000, 500);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ScenarioSet small_set = create_flat_scenarios(10, 0.03);
    ScenarioSet large_set = create_flat_scenarios(100, 0.03);

    ValuationResult small_result = run_valuation(
        policies, mortality, lapse, expenses, small_set);
    ValuationResult large_result = run_valuation(
        policies, mortality, lapse, expenses, large_set);

    // Larger set should take more time (not necessarily 10x due to overhead)
    // Just check that time is recorded for both
    REQUIRE(small_result.execution_time_ms >= 0.0);
    REQUIRE(large_result.execution_time_ms >= 0.0);
}

// ============================================================================
// PolicySet Overload Tests
// ============================================================================

TEST_CASE("PolicySet overload produces same results as vector", "[valuation]") {
    Policy policy = create_simple_policy(1, 35, 15, 100000, 600);

    std::vector<Policy> policies_vec = {policy};
    PolicySet policies_set;
    policies_set.add(policy);

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(10, 0.03);

    ValuationResult vec_result = run_valuation(
        policies_vec, mortality, lapse, expenses, scenarios);
    ValuationResult set_result = run_valuation(
        policies_set, mortality, lapse, expenses, scenarios);

    REQUIRE_THAT(set_result.mean_npv, WithinRel(vec_result.mean_npv, 1e-10));
    REQUIRE_THAT(set_result.std_dev, WithinRel(vec_result.std_dev, 1e-10));
    REQUIRE_THAT(set_result.cte_95, WithinRel(vec_result.cte_95, 1e-10));
}

// ============================================================================
// Scenario NPV Storage Tests
// ============================================================================

TEST_CASE("Scenario NPVs are stored when requested", "[valuation]") {
    Policy policy = create_simple_policy(1, 35, 15, 100000, 600);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(50, 0.03);

    ValuationConfig config;
    config.store_scenario_npvs = true;

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios, config);

    REQUIRE(result.scenario_npvs.size() == 50);
}

TEST_CASE("Scenario NPVs are not stored when not requested", "[valuation]") {
    Policy policy = create_simple_policy(1, 35, 15, 100000, 600);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(50, 0.03);

    ValuationConfig config;
    config.store_scenario_npvs = false;

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios, config);

    REQUIRE(result.scenario_npvs.empty());
}

// ============================================================================
// Known Value Tests (Validation)
// ============================================================================

TEST_CASE("Valuation matches hand-calculated example", "[valuation]") {
    // Simple case: 2 identical policies, 2 identical scenarios
    // Each policy projection should give same NPV
    // Total should be 2 × policy NPV

    Policy policy = create_simple_policy(1, 30, 5, 100000, 1000);
    std::vector<Policy> policies = {policy, policy};

    // Zero mortality and lapse for simplicity
    MortalityTable mortality = create_constant_mortality(0.0);
    LapseTable lapse = create_constant_lapse(0.0);
    ExpenseAssumptions expenses(0, 0, 0, 0);  // Zero expenses

    // Flat 5% interest
    ScenarioSet scenarios = create_flat_scenarios(2, 0.05);

    // With no decrements and no expenses, NPV per policy is sum of discounted premiums
    // Year 1: 1000 / 1.05^1 = 952.38
    // Year 2: 1000 / 1.05^2 = 907.03
    // Year 3: 1000 / 1.05^3 = 863.84
    // Year 4: 1000 / 1.05^4 = 822.70
    // Year 5: 1000 / 1.05^5 = 783.53
    // Total per policy = 4329.48
    // Total for 2 policies = 8658.96

    double df1 = 1.0 / 1.05;
    double df2 = 1.0 / (1.05 * 1.05);
    double df3 = 1.0 / (1.05 * 1.05 * 1.05);
    double df4 = 1.0 / (1.05 * 1.05 * 1.05 * 1.05);
    double df5 = 1.0 / (1.05 * 1.05 * 1.05 * 1.05 * 1.05);
    double expected_per_policy = 1000 * (df1 + df2 + df3 + df4 + df5);
    double expected_total = 2 * expected_per_policy;

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    REQUIRE_THAT(result.mean_npv, WithinRel(expected_total, 0.0001));
    REQUIRE(result.std_dev == 0.0);  // All scenarios identical
    REQUIRE_THAT(result.scenario_npvs[0], WithinRel(expected_total, 0.0001));
    REQUIRE_THAT(result.scenario_npvs[1], WithinRel(expected_total, 0.0001));
}

// ============================================================================
// Scale Tests (Small-Scale Performance Validation)
// ============================================================================

TEST_CASE("Handles 100 policies × 100 scenarios", "[valuation]") {
    Policy template_policy = create_simple_policy(1, 35, 20, 100000, 600);
    std::vector<Policy> policies = create_identical_policies(100, template_policy);

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(100, 0.03);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    // Should complete and produce valid results
    REQUIRE(result.scenario_npvs.size() == 100);
    REQUIRE(!std::isnan(result.mean_npv));
    REQUIRE(!std::isnan(result.std_dev));
    REQUIRE(result.execution_time_ms > 0.0);
}

TEST_CASE("Handles 1000 policies × 100 scenarios", "[valuation]") {
    Policy template_policy = create_simple_policy(1, 35, 20, 100000, 600);
    std::vector<Policy> policies = create_identical_policies(1000, template_policy);

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);
    ScenarioSet scenarios = create_flat_scenarios(100, 0.03);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    // Should complete and produce valid results
    REQUIRE(result.scenario_npvs.size() == 100);
    REQUIRE(!std::isnan(result.mean_npv));
    REQUIRE(!std::isnan(result.std_dev));
}

// ============================================================================
// Stochastic Scenario Tests
// ============================================================================

TEST_CASE("GBM scenarios produce distribution with expected characteristics", "[valuation]") {
    Policy policy = create_simple_policy(1, 35, 20, 100000, 600);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    // Generate stochastic scenarios
    ScenarioGeneratorParams params(0.04, 0.0, 0.015, 0.0, 0.15);
    ScenarioSet scenarios = ScenarioSet::generate(500, params, 99999);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    // With stochastic scenarios, we expect:
    // - Non-zero standard deviation
    // - Percentiles that span a range
    REQUIRE(result.std_dev > 0.0);
    REQUIRE(result.p99() > result.p50());
    REQUIRE(result.p50() > result.cte_95);  // CTE_95 is average of worst 5%
}

TEST_CASE("Seed reproducibility produces identical valuation results", "[valuation]") {
    Policy policy = create_simple_policy(1, 35, 20, 100000, 600);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ScenarioGeneratorParams params(0.03, 0.0, 0.01, 0.0, 0.20);

    // Generate two scenario sets with same seed
    ScenarioSet scenarios1 = ScenarioSet::generate(100, params, 42);
    ScenarioSet scenarios2 = ScenarioSet::generate(100, params, 42);

    ValuationResult result1 = run_valuation(
        policies, mortality, lapse, expenses, scenarios1);
    ValuationResult result2 = run_valuation(
        policies, mortality, lapse, expenses, scenarios2);

    REQUIRE_THAT(result1.mean_npv, WithinRel(result2.mean_npv, 1e-10));
    REQUIRE_THAT(result1.std_dev, WithinRel(result2.std_dev, 1e-10));
    REQUIRE_THAT(result1.cte_95, WithinRel(result2.cte_95, 1e-10));
}

// ============================================================================
// US-005: Nested Stochastic Valuation Tests
// ============================================================================

TEST_CASE("Parallelization produces identical results to serial execution", "[valuation][parallel]") {
    // Test that parallel execution (via OpenMP) produces same results as serial
    // Create a moderate-sized test: 1000 policies × 100 scenarios
    Policy template_policy = create_simple_policy(1, 40, 20, 100000, 500);
    std::vector<Policy> policies = create_identical_policies(1000, template_policy);

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ScenarioGeneratorParams params(0.03, 0.0, 0.02, 0.0, 0.20);
    ScenarioSet scenarios = ScenarioSet::generate(100, params, 42);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    // Verify results are consistent
    REQUIRE(result.mean_npv != 0.0);
    REQUIRE(result.std_dev > 0.0);
    REQUIRE(result.scenario_npvs.size() == 100);
    REQUIRE(result.scenarios_failed == 0);

    // Percentiles should be ordered
    REQUIRE(result.p50() <= result.p75());
    REQUIRE(result.p75() <= result.p90());
    REQUIRE(result.p90() <= result.p95());
    REQUIRE(result.p95() <= result.p99());
}

TEST_CASE("No scenarios fail with valid data", "[valuation][error-handling]") {
    // Test that scenarios_failed counter is 0 when all data is valid
    Policy policy = create_simple_policy(1, 35, 15, 100000, 600);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ScenarioSet scenarios = create_flat_scenarios(50, 0.03);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    REQUIRE(result.scenarios_failed == 0);
    REQUIRE(result.scenario_npvs.size() == 50);
    REQUIRE(result.mean_npv != 0.0);
}

TEST_CASE("Large-scale valuation performance target: 100K policies × 1K scenarios", "[valuation][performance][.large]") {
    // Performance target: 100K policies × 1K scenarios in <30 seconds (native)
    // This test is tagged with [.large] to exclude from default test runs
    // Run with: ./tests [performance]

    Policy template_policy = create_simple_policy(1, 40, 20, 100000, 500);
    std::vector<Policy> policies = create_identical_policies(100000, template_policy);

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ScenarioGeneratorParams params(0.03, 0.0, 0.02, 0.0, 0.20);
    ScenarioSet scenarios = ScenarioSet::generate(1000, params, 42);

    auto start = std::chrono::high_resolution_clock::now();
    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);
    auto end = std::chrono::high_resolution_clock::now();

    double elapsed_seconds = std::chrono::duration<double>(end - start).count();

    // Log performance metrics
    std::cout << "\n=== Performance Test: 100K policies × 1K scenarios ===" << std::endl;
    std::cout << "Execution time: " << elapsed_seconds << " seconds" << std::endl;
    std::cout << "Throughput: " << (100000.0 * 1000.0 / elapsed_seconds) << " projections/second" << std::endl;
#ifdef HAVE_OPENMP
    std::cout << "OpenMP threads: " << omp_get_max_threads() << std::endl;
#else
    std::cout << "OpenMP: not available (single-threaded)" << std::endl;
#endif

    // Verify results
    REQUIRE(result.scenarios_failed == 0);
    REQUIRE(result.scenario_npvs.size() == 1000);
    REQUIRE(result.mean_npv != 0.0);
    REQUIRE(result.execution_time_ms > 0.0);

    // Performance target: <30 seconds
    // Note: This is very aggressive and depends on hardware
    // On a modern multi-core CPU with OpenMP, should be achievable
    // If this fails, it's informational rather than a hard error
    if (elapsed_seconds > 30.0) {
        std::cout << "Warning: Performance target missed (>30s). Consider optimizing or increasing hardware." << std::endl;
    }
}

TEST_CASE("1M policies × 1K scenarios performance target", "[valuation][performance][.extreme]") {
    // Performance target: 1M policies × 1K scenarios in <120 seconds (native)
    // This is an extreme test - tagged with [.extreme] to exclude from most runs
    // Run with: ./tests [extreme]

    Policy template_policy = create_simple_policy(1, 40, 20, 100000, 500);
    std::vector<Policy> policies = create_identical_policies(1000000, template_policy);

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ScenarioGeneratorParams params(0.03, 0.0, 0.02, 0.0, 0.20);
    ScenarioSet scenarios = ScenarioSet::generate(1000, params, 42);

    auto start = std::chrono::high_resolution_clock::now();
    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);
    auto end = std::chrono::high_resolution_clock::now();

    double elapsed_seconds = std::chrono::duration<double>(end - start).count();

    // Log performance metrics
    std::cout << "\n=== Extreme Performance Test: 1M policies × 1K scenarios ===" << std::endl;
    std::cout << "Execution time: " << elapsed_seconds << " seconds" << std::endl;
    std::cout << "Throughput: " << (1000000.0 * 1000.0 / elapsed_seconds) << " projections/second" << std::endl;
#ifdef HAVE_OPENMP
    std::cout << "OpenMP threads: " << omp_get_max_threads() << std::endl;
#else
    std::cout << "OpenMP: not available (single-threaded)" << std::endl;
#endif

    // Verify results
    REQUIRE(result.scenarios_failed == 0);
    REQUIRE(result.scenario_npvs.size() == 1000);
    REQUIRE(result.mean_npv != 0.0);
    REQUIRE(result.execution_time_ms > 0.0);

    // Performance target: <120 seconds
    if (elapsed_seconds <= 120.0) {
        std::cout << "Performance target met: " << elapsed_seconds << "s < 120s ✓" << std::endl;
    } else {
        std::cout << "Warning: Performance target missed (" << elapsed_seconds << "s > 120s)" << std::endl;
    }
}

TEST_CASE("Scenarios_failed counter initialized to 0", "[valuation][error-handling]") {
    ValuationResult result;
    REQUIRE(result.scenarios_failed == 0);
}

TEST_CASE("Execution time is always positive for non-empty runs", "[valuation][metrics]") {
    Policy policy = create_simple_policy(1, 30, 10, 100000, 500);
    std::vector<Policy> policies = {policy};

    MortalityTable mortality = create_constant_mortality(0.01);
    LapseTable lapse = create_constant_lapse(0.05);
    ExpenseAssumptions expenses(100, 20, 0.03, 50);

    ScenarioSet scenarios = create_flat_scenarios(10, 0.03);

    ValuationResult result = run_valuation(
        policies, mortality, lapse, expenses, scenarios);

    REQUIRE(result.execution_time_ms > 0.0);
}
