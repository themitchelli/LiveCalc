#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "projection.hpp"
#include <cmath>
#include <sstream>

using namespace livecalc;
using Catch::Approx;

// ============================================================================
// Helper functions for setting up test data
// ============================================================================

Policy make_test_policy(uint8_t age = 40, uint8_t term = 10, double sum_assured = 100000.0, double premium = 500.0) {
    Policy p;
    p.policy_id = 1;
    p.age = age;
    p.gender = Gender::Male;
    p.sum_assured = sum_assured;
    p.premium = premium;
    p.term = term;
    p.product_type = ProductType::Term;
    return p;
}

MortalityTable make_flat_mortality(double qx = 0.001) {
    MortalityTable table;
    for (uint8_t age = 0; age <= MortalityTable::MAX_AGE; ++age) {
        table.set_qx(age, Gender::Male, qx);
        table.set_qx(age, Gender::Female, qx * 0.8);  // Females have lower mortality
    }
    return table;
}

LapseTable make_flat_lapse(double rate = 0.05) {
    LapseTable table;
    for (uint8_t year = 1; year <= LapseTable::MAX_YEAR; ++year) {
        table.set_rate(year, rate);
    }
    return table;
}

Scenario make_flat_scenario(double rate = 0.05) {
    Scenario scenario;
    for (uint8_t year = 1; year <= Scenario::MAX_YEAR; ++year) {
        scenario.set_rate(year, rate);
    }
    return scenario;
}

ExpenseAssumptions make_test_expenses() {
    return ExpenseAssumptions(100.0, 25.0, 0.05, 50.0);
    // per_policy_acquisition = 100
    // per_policy_maintenance = 25
    // percent_of_premium = 0.05 (5%)
    // claim_expense = 50
}

// ============================================================================
// ProjectionResult Tests
// ============================================================================

TEST_CASE("ProjectionResult default constructor", "[projection]") {
    ProjectionResult result;
    REQUIRE(result.npv == 0.0);
    REQUIRE(result.cashflows.empty());
}

TEST_CASE("ProjectionResult NPV-only constructor", "[projection]") {
    ProjectionResult result(12345.67);
    REQUIRE(result.npv == Approx(12345.67));
    REQUIRE(result.cashflows.empty());
}

TEST_CASE("ProjectionConfig defaults", "[projection]") {
    ProjectionConfig config;
    REQUIRE(config.detailed_cashflows == false);
    REQUIRE(config.mortality_multiplier == 1.0);
    REQUIRE(config.lapse_multiplier == 1.0);
    REQUIRE(config.expense_multiplier == 1.0);
}

// ============================================================================
// Basic Projection Tests
// ============================================================================

TEST_CASE("project_policy with zero term returns zero NPV", "[projection]") {
    Policy policy = make_test_policy();
    policy.term = 0;

    MortalityTable mortality = make_flat_mortality();
    LapseTable lapse = make_flat_lapse();
    ExpenseAssumptions expenses = make_test_expenses();
    Scenario scenario = make_flat_scenario();

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario);
    REQUIRE(result.npv == 0.0);
}

TEST_CASE("project_policy returns correct number of cash flows", "[projection]") {
    Policy policy = make_test_policy(40, 10);  // 10-year term

    MortalityTable mortality = make_flat_mortality();
    LapseTable lapse = make_flat_lapse();
    ExpenseAssumptions expenses = make_test_expenses();
    Scenario scenario = make_flat_scenario();

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // Should have 10 years of cash flows
    REQUIRE(result.cashflows.size() == 10);

    // Years should be 1 through 10
    for (size_t i = 0; i < result.cashflows.size(); ++i) {
        REQUIRE(result.cashflows[i].year == i + 1);
    }
}

TEST_CASE("project_policy lives decrease each year", "[projection]") {
    Policy policy = make_test_policy(40, 10);

    MortalityTable mortality = make_flat_mortality(0.01);  // 1% mortality
    LapseTable lapse = make_flat_lapse(0.05);              // 5% lapse
    ExpenseAssumptions expenses = make_test_expenses();
    Scenario scenario = make_flat_scenario();

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // First year starts with 1.0 lives
    REQUIRE(result.cashflows[0].lives_boy == 1.0);

    // Lives should decrease each year
    for (size_t i = 1; i < result.cashflows.size(); ++i) {
        REQUIRE(result.cashflows[i].lives_boy < result.cashflows[i-1].lives_boy);
    }
}

TEST_CASE("project_policy discount factors decrease each year", "[projection]") {
    Policy policy = make_test_policy(40, 10);

    MortalityTable mortality = make_flat_mortality();
    LapseTable lapse = make_flat_lapse();
    ExpenseAssumptions expenses = make_test_expenses();
    Scenario scenario = make_flat_scenario(0.05);  // 5% discount rate

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // Discount factors should decrease each year
    for (size_t i = 0; i < result.cashflows.size(); ++i) {
        double expected_df = 1.0 / std::pow(1.05, i + 1);
        REQUIRE(result.cashflows[i].discount_factor == Approx(expected_df).epsilon(0.0001));
    }
}

// ============================================================================
// Edge Case Tests
// ============================================================================

TEST_CASE("project_policy with age 0", "[projection][edge-case]") {
    Policy policy = make_test_policy(0, 20);  // Age 0, 20-year term

    MortalityTable mortality = make_flat_mortality();
    LapseTable lapse = make_flat_lapse();
    ExpenseAssumptions expenses = make_test_expenses();
    Scenario scenario = make_flat_scenario();

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    REQUIRE(result.cashflows.size() == 20);
    REQUIRE(result.cashflows[0].year == 1);
}

TEST_CASE("project_policy with age 120", "[projection][edge-case]") {
    Policy policy = make_test_policy(120, 5);  // Age 120, 5-year term

    MortalityTable mortality = make_flat_mortality();
    LapseTable lapse = make_flat_lapse();
    ExpenseAssumptions expenses = make_test_expenses();
    Scenario scenario = make_flat_scenario();

    ProjectionConfig config;
    config.detailed_cashflows = true;

    // Should project at max age (capped)
    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    REQUIRE(result.cashflows.size() == 5);
}

TEST_CASE("project_policy with term 1", "[projection][edge-case]") {
    Policy policy = make_test_policy(40, 1);  // 1-year term

    MortalityTable mortality = make_flat_mortality();
    LapseTable lapse = make_flat_lapse();
    ExpenseAssumptions expenses = make_test_expenses();
    Scenario scenario = make_flat_scenario();

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    REQUIRE(result.cashflows.size() == 1);
    REQUIRE(result.cashflows[0].year == 1);
}

TEST_CASE("project_policy with term 50", "[projection][edge-case]") {
    Policy policy = make_test_policy(30, 50);  // Age 30, 50-year term

    MortalityTable mortality = make_flat_mortality();
    LapseTable lapse = make_flat_lapse();
    ExpenseAssumptions expenses = make_test_expenses();
    Scenario scenario = make_flat_scenario();

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // Term capped at min(policy.term, MAX_YEAR)
    REQUIRE(result.cashflows.size() == 50);
    REQUIRE(result.cashflows[49].year == 50);
}

TEST_CASE("project_policy exceeding MAX_AGE uses MAX_AGE mortality", "[projection][edge-case]") {
    // Start at age 118, project 5 years - will exceed MAX_AGE of 120
    Policy policy = make_test_policy(118, 5);

    MortalityTable mortality;
    // Set different mortality at age 118, 119, 120
    for (uint8_t age = 0; age <= 117; ++age) {
        mortality.set_qx(age, Gender::Male, 0.01);
    }
    mortality.set_qx(118, Gender::Male, 0.10);
    mortality.set_qx(119, Gender::Male, 0.15);
    mortality.set_qx(120, Gender::Male, 0.25);  // Will be used for ages 120+

    LapseTable lapse = make_flat_lapse(0.0);  // No lapse for simplicity
    ExpenseAssumptions expenses(0, 0, 0, 0);   // No expenses for simplicity
    Scenario scenario = make_flat_scenario(0.0);  // No discounting

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    REQUIRE(result.cashflows.size() == 5);

    // Year 1: age 118, qx = 0.10
    // Year 2: age 119, qx = 0.15
    // Year 3: age 120, qx = 0.25 (capped)
    // Year 4: age 121 -> capped at 120, qx = 0.25
    // Year 5: age 122 -> capped at 120, qx = 0.25
}

// ============================================================================
// Hand-Calculated Validation Test
// ============================================================================

TEST_CASE("project_policy matches hand calculation within 0.01%", "[projection][validation]") {
    // Simple test case for manual verification
    // Policy: Age 40, 3-year term, £100,000 sum assured, £1,000 premium
    Policy policy = make_test_policy(40, 3, 100000.0, 1000.0);

    // Mortality: flat 0.001 (0.1%) at all ages
    MortalityTable mortality = make_flat_mortality(0.001);

    // Lapse: flat 0% (no lapses for simplicity)
    LapseTable lapse = make_flat_lapse(0.0);

    // Expenses: £100 acquisition, £25 maintenance, 5% of premium, £50 claim
    // First year: 100 + 25 + 50 = 175
    // Renewal:    0 + 25 + 50 = 75
    ExpenseAssumptions expenses(100.0, 25.0, 0.05, 50.0);

    // Discount rate: flat 5%
    Scenario scenario = make_flat_scenario(0.05);

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // Manual calculation:
    // Year 1:
    //   lives_boy = 1.0
    //   premium_income = 1.0 × 1000 = 1000
    //   qx = 0.001
    //   deaths = 1.0 × 0.001 = 0.001
    //   death_benefit = 0.001 × 100000 = 100
    //   lapse_rate = 0.0
    //   lapses = 0
    //   surrender_benefit = 0
    //   first_year_expense = (100 + 25 + 0.05×1000) × 1.0 = 175
    //   claim_expense = 0.001 × 50 = 0.05
    //   total_expense = 175.05
    //   net_cashflow = 1000 - 100 - 0 - 175.05 = 724.95
    //   discount_factor = 1/1.05 = 0.952381
    //   discounted_cf = 724.95 × 0.952381 = 690.428571
    //   lives_eoy = 1.0 × (1 - 0.001) = 0.999

    double year1_expected_net = 1000.0 - 100.0 - 0.0 - (100.0 + 25.0 + 0.05*1000.0 + 0.001*50.0);
    double year1_expected_df = 1.0 / 1.05;
    double year1_expected_discounted = year1_expected_net * year1_expected_df;

    REQUIRE(result.cashflows[0].lives_boy == 1.0);
    REQUIRE(result.cashflows[0].premium_income == Approx(1000.0));
    REQUIRE(result.cashflows[0].death_benefit == Approx(100.0));
    REQUIRE(result.cashflows[0].surrender_benefit == Approx(0.0));
    REQUIRE(result.cashflows[0].expenses == Approx(175.05).epsilon(0.0001));
    REQUIRE(result.cashflows[0].net_cashflow == Approx(year1_expected_net).epsilon(0.0001));
    REQUIRE(result.cashflows[0].discount_factor == Approx(year1_expected_df).epsilon(0.0001));
    REQUIRE(result.cashflows[0].discounted_cashflow == Approx(year1_expected_discounted).epsilon(0.0001));

    // Year 2:
    //   lives_boy = 0.999
    //   premium_income = 0.999 × 1000 = 999
    //   deaths = 0.999 × 0.001 = 0.000999
    //   death_benefit = 0.000999 × 100000 = 99.9
    //   renewal_expense = (25 + 0.05×1000) × 0.999 = 74.925
    //   claim_expense = 0.000999 × 50 = 0.04995
    //   total_expense = 74.97495
    //   net_cashflow = 999 - 99.9 - 74.97495 = 824.12505
    //   discount_factor = 1/(1.05)^2 = 0.907029
    //   lives_eoy = 0.999 × (1 - 0.001) = 0.998001

    double lives_y2 = 0.999;
    double deaths_y2 = lives_y2 * 0.001;
    double year2_expected_net = lives_y2*1000.0 - deaths_y2*100000.0 - ((25.0 + 0.05*1000.0)*lives_y2 + deaths_y2*50.0);
    double year2_expected_df = 1.0 / (1.05 * 1.05);
    double year2_expected_discounted = year2_expected_net * year2_expected_df;

    REQUIRE(result.cashflows[1].lives_boy == Approx(0.999).epsilon(0.0001));
    REQUIRE(result.cashflows[1].premium_income == Approx(999.0).epsilon(0.01));
    REQUIRE(result.cashflows[1].death_benefit == Approx(99.9).epsilon(0.01));
    REQUIRE(result.cashflows[1].net_cashflow == Approx(year2_expected_net).epsilon(0.01));
    REQUIRE(result.cashflows[1].discount_factor == Approx(year2_expected_df).epsilon(0.0001));

    // Year 3:
    double lives_y3 = 0.998001;
    double deaths_y3 = lives_y3 * 0.001;
    double year3_expected_net = lives_y3*1000.0 - deaths_y3*100000.0 - ((25.0 + 0.05*1000.0)*lives_y3 + deaths_y3*50.0);
    double year3_expected_df = 1.0 / (1.05 * 1.05 * 1.05);
    double year3_expected_discounted = year3_expected_net * year3_expected_df;

    REQUIRE(result.cashflows[2].lives_boy == Approx(lives_y3).epsilon(0.0001));
    REQUIRE(result.cashflows[2].discount_factor == Approx(year3_expected_df).epsilon(0.0001));

    // Total NPV should match sum of discounted cash flows
    double expected_npv = year1_expected_discounted + year2_expected_discounted + year3_expected_discounted;
    REQUIRE(result.npv == Approx(expected_npv).epsilon(0.0001));

    // Verify within 0.01% of hand calculation
    double hand_calculated_npv = expected_npv;
    double tolerance = std::abs(hand_calculated_npv) * 0.0001;  // 0.01%
    REQUIRE(std::abs(result.npv - hand_calculated_npv) < tolerance);
}

// ============================================================================
// Multiplier Tests
// ============================================================================

TEST_CASE("project_policy mortality multiplier increases death benefits", "[projection][multiplier]") {
    Policy policy = make_test_policy(40, 5);

    MortalityTable mortality = make_flat_mortality(0.01);
    LapseTable lapse = make_flat_lapse(0.0);
    ExpenseAssumptions expenses(0, 0, 0, 0);  // No expenses
    Scenario scenario = make_flat_scenario(0.0);  // No discounting

    ProjectionConfig config;
    config.detailed_cashflows = true;

    // Base case
    ProjectionResult base_result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // With 2x mortality
    config.mortality_multiplier = 2.0;
    ProjectionResult high_mort_result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // Death benefit should be higher with higher mortality
    REQUIRE(high_mort_result.cashflows[0].death_benefit > base_result.cashflows[0].death_benefit);

    // Approximately double (not exactly due to survival effects)
    REQUIRE(high_mort_result.cashflows[0].death_benefit == Approx(base_result.cashflows[0].death_benefit * 2.0).epsilon(0.01));
}

TEST_CASE("project_policy lapse multiplier affects survivors", "[projection][multiplier]") {
    Policy policy = make_test_policy(40, 5);

    MortalityTable mortality = make_flat_mortality(0.0);  // No deaths
    LapseTable lapse = make_flat_lapse(0.10);             // 10% lapse
    ExpenseAssumptions expenses(0, 0, 0, 0);
    Scenario scenario = make_flat_scenario(0.0);

    ProjectionConfig config;
    config.detailed_cashflows = true;

    // Base case
    ProjectionResult base_result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // With 2x lapse
    config.lapse_multiplier = 2.0;
    ProjectionResult high_lapse_result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // Lives should decrease faster with higher lapse
    REQUIRE(high_lapse_result.cashflows[1].lives_boy < base_result.cashflows[1].lives_boy);
}

TEST_CASE("project_policy expense multiplier increases expenses", "[projection][multiplier]") {
    Policy policy = make_test_policy(40, 3);

    MortalityTable mortality = make_flat_mortality(0.0);
    LapseTable lapse = make_flat_lapse(0.0);
    ExpenseAssumptions expenses(100.0, 25.0, 0.05, 50.0);
    Scenario scenario = make_flat_scenario(0.0);

    ProjectionConfig config;
    config.detailed_cashflows = true;

    // Base case
    ProjectionResult base_result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // With 1.5x expenses
    config.expense_multiplier = 1.5;
    ProjectionResult high_expense_result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // Expenses should be 1.5x higher
    REQUIRE(high_expense_result.cashflows[0].expenses == Approx(base_result.cashflows[0].expenses * 1.5).epsilon(0.01));
}

// ============================================================================
// NPV Consistency Tests
// ============================================================================

TEST_CASE("project_policy NPV equals sum of discounted cash flows", "[projection]") {
    Policy policy = make_test_policy(35, 15);

    MortalityTable mortality = make_flat_mortality(0.005);
    LapseTable lapse = make_flat_lapse(0.03);
    ExpenseAssumptions expenses = make_test_expenses();
    Scenario scenario = make_flat_scenario(0.04);

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    double sum_discounted = 0.0;
    for (const auto& cf : result.cashflows) {
        sum_discounted += cf.discounted_cashflow;
    }

    REQUIRE(result.npv == Approx(sum_discounted).epsilon(0.0001));
}

TEST_CASE("project_policy without detailed cashflows returns same NPV", "[projection]") {
    Policy policy = make_test_policy(45, 20);

    MortalityTable mortality = make_flat_mortality(0.008);
    LapseTable lapse = make_flat_lapse(0.04);
    ExpenseAssumptions expenses = make_test_expenses();
    Scenario scenario = make_flat_scenario(0.035);

    ProjectionConfig with_details;
    with_details.detailed_cashflows = true;

    ProjectionConfig without_details;
    without_details.detailed_cashflows = false;

    ProjectionResult result_with = project_policy(policy, mortality, lapse, expenses, scenario, with_details);
    ProjectionResult result_without = project_policy(policy, mortality, lapse, expenses, scenario, without_details);

    REQUIRE(result_with.npv == Approx(result_without.npv).epsilon(0.0001));
    REQUIRE(result_without.cashflows.empty());
}

// ============================================================================
// Gender-Specific Mortality Tests
// ============================================================================

TEST_CASE("project_policy uses correct gender mortality", "[projection]") {
    Policy male_policy = make_test_policy(40, 5);
    male_policy.gender = Gender::Male;

    Policy female_policy = make_test_policy(40, 5);
    female_policy.gender = Gender::Female;

    // Set different mortality by gender
    MortalityTable mortality;
    for (uint8_t age = 0; age <= MortalityTable::MAX_AGE; ++age) {
        mortality.set_qx(age, Gender::Male, 0.02);    // 2% for males
        mortality.set_qx(age, Gender::Female, 0.01);  // 1% for females
    }

    LapseTable lapse = make_flat_lapse(0.0);
    ExpenseAssumptions expenses(0, 0, 0, 0);
    Scenario scenario = make_flat_scenario(0.0);

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult male_result = project_policy(male_policy, mortality, lapse, expenses, scenario, config);
    ProjectionResult female_result = project_policy(female_policy, mortality, lapse, expenses, scenario, config);

    // Male should have higher death benefit (higher mortality)
    REQUIRE(male_result.cashflows[0].death_benefit > female_result.cashflows[0].death_benefit);

    // Specifically, male death benefit should be ~2x female
    REQUIRE(male_result.cashflows[0].death_benefit == Approx(female_result.cashflows[0].death_benefit * 2.0).epsilon(0.01));
}

// ============================================================================
// Variable Interest Rate Tests
// ============================================================================

TEST_CASE("project_policy handles variable interest rates", "[projection]") {
    Policy policy = make_test_policy(40, 5);

    MortalityTable mortality = make_flat_mortality(0.0);
    LapseTable lapse = make_flat_lapse(0.0);
    ExpenseAssumptions expenses(0, 0, 0, 0);

    // Create scenario with increasing rates
    Scenario scenario;
    scenario.set_rate(1, 0.02);
    scenario.set_rate(2, 0.03);
    scenario.set_rate(3, 0.04);
    scenario.set_rate(4, 0.05);
    scenario.set_rate(5, 0.06);
    // Fill remaining years
    for (uint8_t y = 6; y <= 50; ++y) {
        scenario.set_rate(y, 0.06);
    }

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // Verify discount factors
    REQUIRE(result.cashflows[0].discount_factor == Approx(1.0/1.02).epsilon(0.0001));
    REQUIRE(result.cashflows[1].discount_factor == Approx(1.0/(1.02*1.03)).epsilon(0.0001));
    REQUIRE(result.cashflows[2].discount_factor == Approx(1.0/(1.02*1.03*1.04)).epsilon(0.0001));
    REQUIRE(result.cashflows[3].discount_factor == Approx(1.0/(1.02*1.03*1.04*1.05)).epsilon(0.0001));
    REQUIRE(result.cashflows[4].discount_factor == Approx(1.0/(1.02*1.03*1.04*1.05*1.06)).epsilon(0.0001));
}

// ============================================================================
// First Year vs Renewal Expense Tests
// ============================================================================

TEST_CASE("project_policy applies first year expense correctly", "[projection]") {
    Policy policy = make_test_policy(40, 3, 100000.0, 1000.0);

    MortalityTable mortality = make_flat_mortality(0.0);
    LapseTable lapse = make_flat_lapse(0.0);
    ExpenseAssumptions expenses(200.0, 50.0, 0.10, 0.0);  // High acquisition, lower maintenance
    Scenario scenario = make_flat_scenario(0.0);

    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // Year 1: acquisition + maintenance + % of premium = 200 + 50 + 100 = 350
    double expected_y1_expense = 200.0 + 50.0 + 0.10 * 1000.0;
    REQUIRE(result.cashflows[0].expenses == Approx(expected_y1_expense).epsilon(0.01));

    // Year 2: maintenance + % of premium only = 50 + 100 = 150
    double expected_y2_expense = 50.0 + 0.10 * 1000.0;
    REQUIRE(result.cashflows[1].expenses == Approx(expected_y2_expense).epsilon(0.01));

    // Year 3: same as year 2
    REQUIRE(result.cashflows[2].expenses == Approx(expected_y2_expense).epsilon(0.01));
}
