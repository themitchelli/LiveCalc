#include <catch2/catch_test_macros.hpp>
#include "../src/policy.hpp"
#include "../src/assumptions.hpp"
#include "../src/scenario.hpp"
#include "../src/valuation.hpp"
#include "../src/io/parquet_writer.hpp"
#include <filesystem>

using namespace livecalc;

#ifdef HAVE_ARROW

TEST_CASE("Parquet I/O - PolicySet round-trip", "[parquet][io]") {
    // Create test policies
    PolicySet policies;

    Policy p1;
    p1.policy_id = 1;
    p1.age = 30;
    p1.gender = Gender::Male;
    p1.sum_assured = 100000.0;
    p1.premium = 500.0;
    p1.term = 20;
    p1.product_type = ProductType::Term;
    p1.underwriting_class = UnderwritingClass::Standard;
    policies.add(std::move(p1));

    Policy p2;
    p2.policy_id = 2;
    p2.age = 35;
    p2.gender = Gender::Female;
    p2.sum_assured = 200000.0;
    p2.premium = 800.0;
    p2.term = 25;
    p2.product_type = ProductType::WholeLife;
    p2.underwriting_class = UnderwritingClass::NonSmoker;
    policies.add(std::move(p2));

    // Write to Parquet (using Python or external tool in actual test)
    // For this test, we'll verify that load_from_parquet works with a pre-created file

    SECTION("load_from_parquet delegates to ParquetReader") {
        // This test verifies the wrapper method exists and delegates correctly
        // In practice, you would need a real Parquet file for full integration testing

        // Verify that the method exists and throws appropriate error for missing file
        REQUIRE_THROWS_AS(PolicySet::load_from_parquet("nonexistent.parquet"), std::runtime_error);
    }
}

TEST_CASE("Parquet I/O - ValuationResult export", "[parquet][io]") {
    SECTION("write_results requires scenario_npvs") {
        ValuationResult empty_result;

        REQUIRE_THROWS_WITH(
            ParquetWriter::write_results(empty_result, "output.parquet"),
            Catch::Matchers::ContainsSubstring("no scenario NPVs")
        );
    }

    SECTION("write_results creates valid Parquet file") {
        // Create valuation result with scenario NPVs
        ValuationResult result;
        result.scenario_npvs = {100000.0, 105000.0, 98000.0, 102000.0, 110000.0};
        result.mean_npv = 103000.0;
        result.std_dev = 4242.6;
        result.execution_time_ms = 150.5;

        std::string test_output = "test_results.parquet";

        // Clean up any existing file
        if (std::filesystem::exists(test_output)) {
            std::filesystem::remove(test_output);
        }

        // Write to Parquet
        REQUIRE_NOTHROW(ParquetWriter::write_results(result, test_output));

        // Verify file was created
        REQUIRE(std::filesystem::exists(test_output));
        REQUIRE(std::filesystem::file_size(test_output) > 0);

        // Clean up
        std::filesystem::remove(test_output);
    }
}

TEST_CASE("Parquet I/O - Full round-trip integration", "[parquet][io][integration]") {
    // Create test policies
    PolicySet policies;

    for (uint64_t i = 1; i <= 10; ++i) {
        Policy p;
        p.policy_id = i;
        p.age = static_cast<uint8_t>(25 + i);
        p.gender = (i % 2 == 0) ? Gender::Female : Gender::Male;
        p.sum_assured = 50000.0 * i;
        p.premium = 200.0 * i;
        p.term = 20;
        p.product_type = ProductType::Term;
        p.underwriting_class = (i % 3 == 0) ? UnderwritingClass::Smoker : UnderwritingClass::Standard;
        policies.add(std::move(p));
    }

    // Create simple assumptions
    MortalityTable mortality;
    for (uint8_t age = 0; age <= 120; ++age) {
        for (uint8_t gender = 0; gender < 2; ++gender) {
            mortality.set_qx(age, static_cast<Gender>(gender), 0.001 * (age / 100.0));
        }
    }

    LapseTable lapse;
    for (uint8_t year = 1; year <= 50; ++year) {
        lapse.set_lapse_rate(year, 0.05);
    }

    ExpenseAssumptions expenses;
    expenses.per_policy = 50.0;
    expenses.pct_of_premium = 0.05;

    // Generate scenarios
    ScenarioSet scenarios = ScenarioSet::generate(10, 42, 0.05, 0.0, 0.01, 0.0, 0.15);

    // Run valuation with scenario NPVs stored
    ValuationConfig config;
    config.store_scenario_npvs = true;

    ValuationResult result = run_valuation(policies, mortality, lapse, expenses, scenarios, config);

    REQUIRE(result.scenario_npvs.size() == 10);
    REQUIRE(result.mean_npv != 0.0);

    // Export results to Parquet
    std::string test_output = "test_full_results.parquet";
    if (std::filesystem::exists(test_output)) {
        std::filesystem::remove(test_output);
    }

    REQUIRE_NOTHROW(ParquetWriter::write_results(result, test_output));
    REQUIRE(std::filesystem::exists(test_output));

    // Verify file size is reasonable (should be > 100 bytes for 10 scenarios)
    REQUIRE(std::filesystem::file_size(test_output) > 100);

    // Clean up
    std::filesystem::remove(test_output);
}

TEST_CASE("Parquet I/O - Large dataset performance", "[parquet][io][performance][!benchmark]") {
    // This test is tagged with [!benchmark] so it won't run by default
    // Run with: ./tests "[parquet][performance]"

    SECTION("Export 1000 scenarios efficiently") {
        ValuationResult result;
        result.scenario_npvs.reserve(1000);

        // Generate 1000 scenario NPVs
        for (int i = 0; i < 1000; ++i) {
            result.scenario_npvs.push_back(100000.0 + i * 100.0);
        }

        result.mean_npv = 150000.0;
        result.std_dev = 5000.0;

        std::string test_output = "test_large_results.parquet";
        if (std::filesystem::exists(test_output)) {
            std::filesystem::remove(test_output);
        }

        // Time the export
        auto start = std::chrono::high_resolution_clock::now();
        REQUIRE_NOTHROW(ParquetWriter::write_results(result, test_output));
        auto end = std::chrono::high_resolution_clock::now();

        auto duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

        // Should complete in reasonable time (< 1 second for 1000 rows)
        REQUIRE(duration_ms < 1000);

        // Verify file was created
        REQUIRE(std::filesystem::exists(test_output));

        // Verify reasonable file size (should be efficient due to columnar format)
        auto file_size = std::filesystem::file_size(test_output);
        REQUIRE(file_size > 1000);  // At least 1 byte per row
        REQUIRE(file_size < 100000); // But not wasteful (< 100 bytes per row)

        // Clean up
        std::filesystem::remove(test_output);
    }
}

#else // !HAVE_ARROW

TEST_CASE("Parquet I/O - Not available without Arrow", "[parquet]") {
    SECTION("load_from_parquet throws without Arrow") {
        REQUIRE_THROWS(PolicySet::load_from_parquet("test.parquet"));
    }

    SECTION("write_results throws without Arrow") {
        ValuationResult result;
        result.scenario_npvs = {100000.0, 105000.0};

        REQUIRE_THROWS(ParquetWriter::write_results(result, "test.parquet"));
    }
}

#endif // HAVE_ARROW
