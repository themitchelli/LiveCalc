#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "../src/udf/udf_context.hpp"
#include "../src/udf/udf_executor.hpp"
#include "../src/projection.hpp"
#include "../src/policy.hpp"
#include "../src/assumptions.hpp"
#include "../src/scenario.hpp"
#include <fstream>
#include <filesystem>

using namespace livecalc;
using Catch::Approx;

// ============================================================================
// Test Fixtures
// ============================================================================

// Create a simple test UDF script for testing
void create_test_udf_script(const std::string& path, const std::string& content) {
    std::ofstream f(path);
    f << content;
    f.close();
}

// Default test policy
Policy create_test_policy() {
    Policy p;
    p.policy_id = 1;
    p.age = 30;
    p.gender = Gender::Male;
    p.sum_assured = 100000.0;
    p.premium = 1000.0;
    p.term = 20;
    p.product_type = ProductType::Term;
    p.underwriting_class = UnderwritingClass::Standard;
    return p;
}

// ============================================================================
// UDFContext Tests
// ============================================================================

TEST_CASE("UDFContext - Default constructor disables UDFs", "[udf][context]") {
    UDFContext ctx;

    REQUIRE(ctx.enabled == false);
    REQUIRE(ctx.python_script_path.empty());
    REQUIRE(ctx.executor == nullptr);
    REQUIRE(ctx.udfs_called == 0);
    REQUIRE(ctx.udf_time_ms == Approx(0.0));
    REQUIRE(ctx.timeout_ms == 1000);  // Default timeout
}

TEST_CASE("UDFContext - Invalid script path fails gracefully", "[udf][context]") {
    // Non-existent script should create context but with enabled=false
    UDFContext ctx("/nonexistent/script.py");

    REQUIRE(ctx.enabled == false);
    REQUIRE(ctx.executor == nullptr);
}

TEST_CASE("UDFContext - Valid script enables UDFs", "[udf][context]") {
    // Create a minimal valid script
    std::string script_path = "test_udf_valid.py";
    create_test_udf_script(script_path, "def adjust_mortality(policy, year, lives, interest_rate):\n    return 1.0\n");

    UDFContext ctx(script_path);

    REQUIRE(ctx.enabled == true);
    REQUIRE(ctx.executor != nullptr);
    REQUIRE(ctx.python_script_path == script_path);

    // Cleanup
    std::filesystem::remove(script_path);
}

// ============================================================================
// UDFExecutor Tests
// ============================================================================

TEST_CASE("UDFExecutor - Script not found throws exception", "[udf][executor]") {
    REQUIRE_THROWS_AS(UDFExecutor("/nonexistent/script.py"), UDFExecutionError);
}

TEST_CASE("UDFExecutor - has_function detects defined functions", "[udf][executor]") {
    std::string script_path = "test_udf_functions.py";
    create_test_udf_script(script_path,
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    return 1.0\n"
        "\n"
        "def adjust_lapse(policy, year, lives, interest_rate):\n"
        "    return 1.0\n");

    UDFExecutor executor(script_path);

    REQUIRE(executor.has_function("adjust_mortality") == true);
    REQUIRE(executor.has_function("adjust_lapse") == true);
    REQUIRE(executor.has_function("nonexistent_function") == false);

    // Cleanup
    std::filesystem::remove(script_path);
}

TEST_CASE("UDFExecutor - call_udf returns expected value", "[udf][executor]") {
    std::string script_path = "test_udf_return.py";
    create_test_udf_script(script_path,
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    return 1.5\n");

    UDFExecutor executor(script_path);
    Policy policy = create_test_policy();
    UDFState state(1, 1.0, 0.05);

    double result = executor.call_udf("adjust_mortality", policy, state, 1000);

    REQUIRE(result == Approx(1.5));

    // Cleanup
    std::filesystem::remove(script_path);
}

TEST_CASE("UDFExecutor - call_udf with policy-based logic", "[udf][executor]") {
    std::string script_path = "test_udf_policy_logic.py";
    create_test_udf_script(script_path,
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    if policy['underwriting_class'] == 1:  # Smoker\n"
        "        return 1.5\n"
        "    return 1.0\n");

    UDFExecutor executor(script_path);

    // Test with standard policy (underwriting_class = 0)
    Policy standard_policy = create_test_policy();
    standard_policy.underwriting_class = UnderwritingClass::Standard;
    UDFState state(1, 1.0, 0.05);

    double result_standard = executor.call_udf("adjust_mortality", standard_policy, state, 1000);
    REQUIRE(result_standard == Approx(1.0));

    // Test with smoker policy (underwriting_class = 1)
    Policy smoker_policy = create_test_policy();
    smoker_policy.underwriting_class = UnderwritingClass::Smoker;

    double result_smoker = executor.call_udf("adjust_mortality", smoker_policy, state, 1000);
    REQUIRE(result_smoker == Approx(1.5));

    // Cleanup
    std::filesystem::remove(script_path);
}

TEST_CASE("UDFExecutor - call_udf with year-based logic", "[udf][executor]") {
    std::string script_path = "test_udf_year_logic.py";
    create_test_udf_script(script_path,
        "def adjust_lapse(policy, year, lives, interest_rate):\n"
        "    if year <= 5:\n"
        "        return 1.2  # Higher lapse in early years\n"
        "    return 1.0\n");

    UDFExecutor executor(script_path);
    Policy policy = create_test_policy();

    // Test early year (year 3)
    UDFState state_early(3, 1.0, 0.05);
    double result_early = executor.call_udf("adjust_lapse", policy, state_early, 1000);
    REQUIRE(result_early == Approx(1.2));

    // Test later year (year 10)
    UDFState state_later(10, 1.0, 0.05);
    double result_later = executor.call_udf("adjust_lapse", policy, state_later, 1000);
    REQUIRE(result_later == Approx(1.0));

    // Cleanup
    std::filesystem::remove(script_path);
}

TEST_CASE("UDFExecutor - timeout protection", "[udf][executor]") {
    std::string script_path = "test_udf_timeout.py";
    create_test_udf_script(script_path,
        "import time\n"
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    time.sleep(5)  # Sleep for 5 seconds\n"
        "    return 1.0\n");

    UDFExecutor executor(script_path);
    Policy policy = create_test_policy();
    UDFState state(1, 1.0, 0.05);

    // Call with 100ms timeout - should timeout
    REQUIRE_THROWS_AS(executor.call_udf("adjust_mortality", policy, state, 100), UDFExecutionError);

    // Cleanup
    std::filesystem::remove(script_path);
}

TEST_CASE("UDFExecutor - Python syntax error throws exception", "[udf][executor]") {
    std::string script_path = "test_udf_syntax_error.py";
    create_test_udf_script(script_path,
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    return 1.0\n"
        "    invalid syntax here\n");

    UDFExecutor executor(script_path);
    Policy policy = create_test_policy();
    UDFState state(1, 1.0, 0.05);

    REQUIRE_THROWS_AS(executor.call_udf("adjust_mortality", policy, state, 1000), UDFExecutionError);

    // Cleanup
    std::filesystem::remove(script_path);
}

TEST_CASE("UDFExecutor - Python runtime error throws exception", "[udf][executor]") {
    std::string script_path = "test_udf_runtime_error.py";
    create_test_udf_script(script_path,
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    return 1.0 / 0  # Division by zero\n");

    UDFExecutor executor(script_path);
    Policy policy = create_test_policy();
    UDFState state(1, 1.0, 0.05);

    REQUIRE_THROWS_AS(executor.call_udf("adjust_mortality", policy, state, 1000), UDFExecutionError);

    // Cleanup
    std::filesystem::remove(script_path);
}

// ============================================================================
// Projection with UDF Integration Tests
// ============================================================================

TEST_CASE("Projection with UDF - No UDFs matches standard projection", "[udf][projection]") {
    // Setup
    Policy policy = create_test_policy();
    policy.term = 10;

    MortalityTable mortality = MortalityTable::load_from_csv("../data/sample_mortality.csv");

    LapseTable lapse = LapseTable::load_from_csv("../data/sample_lapse.csv");

    ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv("../data/sample_expenses.csv");

    ScenarioGeneratorParams params; params.initial_rate = 0.05; params.drift = 0.0; params.volatility = 0.01; params.min_rate = 0.0; params.max_rate = 0.15; ScenarioSet scenarios = ScenarioSet::generate(1, params, 42);
    Scenario scenario = scenarios.get(0);

    // Run standard projection
    ProjectionConfig config;
    config.detailed_cashflows = false;
    ProjectionResult result_standard = project_policy(policy, mortality, lapse, expenses, scenario, config);

    // Run with UDF context (but UDFs disabled)
    UDFContext udf_ctx;  // Default constructor, disabled
    ProjectionResult result_udf = project_policy_with_udf(policy, mortality, lapse, expenses, scenario, udf_ctx, config);

    // Results should match
    REQUIRE(result_udf.npv == Approx(result_standard.npv));
    REQUIRE(result_udf.udfs_called == 0);
    REQUIRE(result_udf.udf_time_ms == Approx(0.0));
}

TEST_CASE("Projection with UDF - Smoker mortality adjustment increases NPV", "[udf][projection]") {
    // Create smoker adjustment script
    std::string script_path = "test_projection_smoker.py";
    create_test_udf_script(script_path,
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    if policy['underwriting_class'] == 1:  # Smoker\n"
        "        return 1.5  # 50% higher mortality\n"
        "    return 1.0\n");

    // Setup
    MortalityTable mortality = MortalityTable::load_from_csv("../data/sample_mortality.csv");

    LapseTable lapse = LapseTable::load_from_csv("../data/sample_lapse.csv");

    ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv("../data/sample_expenses.csv");

    ScenarioGeneratorParams params; params.initial_rate = 0.05; params.drift = 0.0; params.volatility = 0.01; params.min_rate = 0.0; params.max_rate = 0.15; ScenarioSet scenarios = ScenarioSet::generate(1, params, 42);
    Scenario scenario = scenarios.get(0);

    // Test with standard policy
    Policy standard_policy = create_test_policy();
    standard_policy.term = 10;
    standard_policy.underwriting_class = UnderwritingClass::Standard;

    UDFContext udf_ctx(script_path);
    ProjectionConfig config;
    ProjectionResult result_standard = project_policy_with_udf(standard_policy, mortality, lapse, expenses, scenario, udf_ctx, config);

    // Test with smoker policy
    Policy smoker_policy = create_test_policy();
    smoker_policy.term = 10;
    smoker_policy.underwriting_class = UnderwritingClass::Smoker;

    UDFContext udf_ctx_smoker(script_path);
    ProjectionResult result_smoker = project_policy_with_udf(smoker_policy, mortality, lapse, expenses, scenario, udf_ctx_smoker, config);

    // Smoker should have higher mortality → higher death benefits → lower NPV (more negative)
    REQUIRE(result_smoker.npv < result_standard.npv);

    // UDFs should have been called
    REQUIRE(result_smoker.udfs_called > 0);
    REQUIRE(result_smoker.udf_time_ms > 0.0);

    // Cleanup
    std::filesystem::remove(script_path);
}

TEST_CASE("Projection with UDF - UDF called for each projection year", "[udf][projection]") {
    // Create UDF script
    std::string script_path = "test_projection_years.py";
    create_test_udf_script(script_path,
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    return 1.0\n");

    // Setup
    Policy policy = create_test_policy();
    policy.term = 5;  // 5-year term

    MortalityTable mortality = MortalityTable::load_from_csv("../data/sample_mortality.csv");

    LapseTable lapse = LapseTable::load_from_csv("../data/sample_lapse.csv");

    ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv("../data/sample_expenses.csv");

    ScenarioGeneratorParams params; params.initial_rate = 0.05; params.drift = 0.0; params.volatility = 0.01; params.min_rate = 0.0; params.max_rate = 0.15; ScenarioSet scenarios = ScenarioSet::generate(1, params, 42);
    Scenario scenario = scenarios.get(0);

    UDFContext udf_ctx(script_path);
    ProjectionConfig config;
    ProjectionResult result = project_policy_with_udf(policy, mortality, lapse, expenses, scenario, udf_ctx, config);

    // UDF should be called once per year (5 years × 1 UDF per year = 5 calls)
    REQUIRE(result.udfs_called == 5);
    REQUIRE(result.udf_time_ms > 0.0);

    // Cleanup
    std::filesystem::remove(script_path);
}

TEST_CASE("Projection with UDF - Multiple UDFs called per year", "[udf][projection]") {
    // Create script with both adjust_mortality and adjust_lapse
    std::string script_path = "test_projection_multiple.py";
    create_test_udf_script(script_path,
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    return 1.0\n"
        "\n"
        "def adjust_lapse(policy, year, lives, interest_rate):\n"
        "    return 1.0\n");

    // Setup
    Policy policy = create_test_policy();
    policy.term = 3;  // 3-year term

    MortalityTable mortality = MortalityTable::load_from_csv("../data/sample_mortality.csv");

    LapseTable lapse = LapseTable::load_from_csv("../data/sample_lapse.csv");

    ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv("../data/sample_expenses.csv");

    ScenarioGeneratorParams params; params.initial_rate = 0.05; params.drift = 0.0; params.volatility = 0.01; params.min_rate = 0.0; params.max_rate = 0.15; ScenarioSet scenarios = ScenarioSet::generate(1, params, 42);
    Scenario scenario = scenarios.get(0);

    UDFContext udf_ctx(script_path);
    ProjectionConfig config;
    ProjectionResult result = project_policy_with_udf(policy, mortality, lapse, expenses, scenario, udf_ctx, config);

    // Both UDFs called per year: 3 years × 2 UDFs = 6 calls
    REQUIRE(result.udfs_called == 6);

    // Cleanup
    std::filesystem::remove(script_path);
}

TEST_CASE("Projection with UDF - UDF error handled gracefully", "[udf][projection]") {
    // Create script that will fail
    std::string script_path = "test_projection_error.py";
    create_test_udf_script(script_path,
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    raise ValueError('Test error')\n");

    // Setup
    Policy policy = create_test_policy();
    policy.term = 5;

    MortalityTable mortality = MortalityTable::load_from_csv("../data/sample_mortality.csv");

    LapseTable lapse = LapseTable::load_from_csv("../data/sample_lapse.csv");

    ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv("../data/sample_expenses.csv");

    ScenarioGeneratorParams params; params.initial_rate = 0.05; params.drift = 0.0; params.volatility = 0.01; params.min_rate = 0.0; params.max_rate = 0.15; ScenarioSet scenarios = ScenarioSet::generate(1, params, 42);
    Scenario scenario = scenarios.get(0);

    UDFContext udf_ctx(script_path);
    ProjectionConfig config;

    // Projection should not throw - UDF errors are caught and logged
    REQUIRE_NOTHROW(project_policy_with_udf(policy, mortality, lapse, expenses, scenario, udf_ctx, config));

    // Cleanup
    std::filesystem::remove(script_path);
}

TEST_CASE("Projection with UDF - Detailed cashflows include UDF metrics", "[udf][projection]") {
    // Create UDF script
    std::string script_path = "test_projection_detailed.py";
    create_test_udf_script(script_path,
        "def adjust_mortality(policy, year, lives, interest_rate):\n"
        "    return 1.0\n");

    // Setup
    Policy policy = create_test_policy();
    policy.term = 3;

    MortalityTable mortality = MortalityTable::load_from_csv("../data/sample_mortality.csv");

    LapseTable lapse = LapseTable::load_from_csv("../data/sample_lapse.csv");

    ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv("../data/sample_expenses.csv");

    ScenarioGeneratorParams params; params.initial_rate = 0.05; params.drift = 0.0; params.volatility = 0.01; params.min_rate = 0.0; params.max_rate = 0.15; ScenarioSet scenarios = ScenarioSet::generate(1, params, 42);
    Scenario scenario = scenarios.get(0);

    UDFContext udf_ctx(script_path);
    ProjectionConfig config;
    config.detailed_cashflows = true;

    ProjectionResult result = project_policy_with_udf(policy, mortality, lapse, expenses, scenario, udf_ctx, config);

    // Cashflows should be populated
    REQUIRE(result.cashflows.size() == 3);

    // UDF metrics should be populated
    REQUIRE(result.udfs_called == 3);
    REQUIRE(result.udf_time_ms > 0.0);

    // Cleanup
    std::filesystem::remove(script_path);
}
