#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "../src/assumption_set.hpp"
#include "../src/policy.hpp"
#include <sstream>
#include <fstream>

using namespace livecalc;
using Catch::Matchers::WithinAbs;

TEST_CASE("AssumptionSet default constructor", "[assumption_set]") {
    AssumptionSet as;
    REQUIRE_FALSE(as.is_initialized());
}

TEST_CASE("AssumptionSet load from local files", "[assumption_set]") {
    // Create test CSV files
    const std::string mortality_csv = "test_mortality_set.csv";
    const std::string lapse_csv = "test_lapse_set.csv";
    const std::string expense_csv = "test_expense_set.csv";

    // Write mortality CSV (simplified: same rate for all ages)
    {
        std::ofstream ofs(mortality_csv);
        ofs << "age,male_qx,female_qx\n";
        for (int age = 0; age <= 120; ++age) {
            ofs << age << ",0.01,0.008\n";
        }
    }

    // Write lapse CSV
    {
        std::ofstream ofs(lapse_csv);
        ofs << "year,lapse_rate\n";
        for (int year = 1; year <= 50; ++year) {
            ofs << year << ",0.05\n";
        }
    }

    // Write expense CSV (name-value pairs format)
    {
        std::ofstream ofs(expense_csv);
        ofs << "name,value\n";
        ofs << "acquisition,100\n";
        ofs << "maintenance,50\n";
        ofs << "percent_of_premium,0.05\n";
        ofs << "claim_expense,25\n";
    }

    AssumptionSet as;
    as.load_from_files(mortality_csv, lapse_csv, expense_csv);

    REQUIRE(as.is_initialized());
    REQUIRE_THAT(as.get_mortality_qx(50, Gender::Male), WithinAbs(0.01, 0.0001));
    REQUIRE_THAT(as.get_mortality_qx(50, Gender::Female), WithinAbs(0.008, 0.0001));
    REQUIRE_THAT(as.get_lapse_rate(10), WithinAbs(0.05, 0.0001));
    REQUIRE_THAT(as.get_first_year_expense(1000.0), WithinAbs(200.0, 0.01)); // 100 + 50 + 0.05*1000

    // Check resolved versions
    const auto& versions = as.get_resolved_versions();
    REQUIRE(versions.at("mortality").find("local:") != std::string::npos);

    // Cleanup
    std::remove(mortality_csv.c_str());
    std::remove(lapse_csv.c_str());
    std::remove(expense_csv.c_str());
}

TEST_CASE("AssumptionSet throws when not initialized", "[assumption_set]") {
    AssumptionSet as;
    REQUIRE_THROWS_AS(as.get_mortality_qx(50, Gender::Male), std::runtime_error);
    REQUIRE_THROWS_AS(as.get_lapse_rate(10), std::runtime_error);
    REQUIRE_THROWS_AS(as.get_first_year_expense(1000.0), std::runtime_error);
}

TEST_CASE("AssumptionSet get mortality with multiplier", "[assumption_set]") {
    // Setup
    const std::string mortality_csv = "test_mortality_mult.csv";
    {
        std::ofstream ofs(mortality_csv);
        ofs << "age,male_qx,female_qx\n";
        for (int age = 0; age <= 120; ++age) {
            ofs << age << ",0.01,0.008\n";
        }
    }

    const std::string lapse_csv = "test_lapse_mult.csv";
    {
        std::ofstream ofs(lapse_csv);
        ofs << "year,lapse_rate\n";
        for (int year = 1; year <= 50; ++year) {
            ofs << year << ",0.05\n";
        }
    }

    const std::string expense_csv = "test_expense_mult.csv";
    {
        std::ofstream ofs(expense_csv);
        ofs << "name,value\n";
        ofs << "acquisition,100\n";
        ofs << "maintenance,50\n";
        ofs << "percent_of_premium,0.05\n";
        ofs << "claim_expense,25\n";
    }

    AssumptionSet as;
    as.load_from_files(mortality_csv, lapse_csv, expense_csv);

    // Test mortality multiplier (1.2x = 20% higher mortality)
    REQUIRE_THAT(as.get_mortality_qx(50, Gender::Male, 1.2), WithinAbs(0.012, 0.0001));

    // Test lapse multiplier (0.5x = 50% lower lapse)
    REQUIRE_THAT(as.get_lapse_rate(10, 0.5), WithinAbs(0.025, 0.0001));

    // Test expense multiplier
    REQUIRE_THAT(as.get_first_year_expense(1000.0, 1.1), WithinAbs(220.0, 0.01)); // (100+50+50)*1.1

    // Cleanup
    std::remove(mortality_csv.c_str());
    std::remove(lapse_csv.c_str());
    std::remove(expense_csv.c_str());
}

TEST_CASE("AssumptionSet direct table access", "[assumption_set]") {
    // Setup
    const std::string mortality_csv = "test_mortality_direct.csv";
    {
        std::ofstream ofs(mortality_csv);
        ofs << "age,male_qx,female_qx\n";
        for (int age = 0; age <= 120; ++age) {
            ofs << age << ",0.01,0.008\n";
        }
    }

    const std::string lapse_csv = "test_lapse_direct.csv";
    {
        std::ofstream ofs(lapse_csv);
        ofs << "year,lapse_rate\n";
        for (int year = 1; year <= 50; ++year) {
            ofs << year << ",0.05\n";
        }
    }

    const std::string expense_csv = "test_expense_direct.csv";
    {
        std::ofstream ofs(expense_csv);
        ofs << "name,value\n";
        ofs << "acquisition,100\n";
        ofs << "maintenance,50\n";
        ofs << "percent_of_premium,0.05\n";
        ofs << "claim_expense,25\n";
    }

    AssumptionSet as;
    as.load_from_files(mortality_csv, lapse_csv, expense_csv);

    // Test direct access
    const auto& mort = as.get_mortality_table();
    REQUIRE_THAT(mort.get_qx(50, Gender::Male), WithinAbs(0.01, 0.0001));

    const auto& lapse = as.get_lapse_table();
    REQUIRE_THAT(lapse.get_rate(10), WithinAbs(0.05, 0.0001));

    const auto& exp = as.get_expense_assumptions();
    REQUIRE_THAT(exp.per_policy_acquisition, WithinAbs(100.0, 0.01));

    // Cleanup
    std::remove(mortality_csv.c_str());
    std::remove(lapse_csv.c_str());
    std::remove(expense_csv.c_str());
}

TEST_CASE("AssumptionSet boundary lookups", "[assumption_set]") {
    // Setup
    const std::string mortality_csv = "test_mortality_boundary.csv";
    {
        std::ofstream ofs(mortality_csv);
        ofs << "age,male_qx,female_qx\n";
        for (int age = 0; age <= 120; ++age) {
            double qx = 0.001 * age; // Increases with age
            ofs << age << "," << qx << "," << (qx * 0.8) << "\n";
        }
    }

    const std::string lapse_csv = "test_lapse_boundary.csv";
    {
        std::ofstream ofs(lapse_csv);
        ofs << "year,lapse_rate\n";
        for (int year = 1; year <= 50; ++year) {
            ofs << year << ",0.05\n";
        }
    }

    const std::string expense_csv = "test_expense_boundary.csv";
    {
        std::ofstream ofs(expense_csv);
        ofs << "name,value\n";
        ofs << "acquisition,100\n";
        ofs << "maintenance,50\n";
        ofs << "percent_of_premium,0.05\n";
        ofs << "claim_expense,25\n";
    }

    AssumptionSet as;
    as.load_from_files(mortality_csv, lapse_csv, expense_csv);

    // Test boundary ages
    REQUIRE_THAT(as.get_mortality_qx(0, Gender::Male), WithinAbs(0.0, 0.0001));
    REQUIRE_THAT(as.get_mortality_qx(120, Gender::Male), WithinAbs(0.12, 0.0001));

    // Test boundary years
    REQUIRE_THAT(as.get_lapse_rate(1), WithinAbs(0.05, 0.0001));
    REQUIRE_THAT(as.get_lapse_rate(50), WithinAbs(0.05, 0.0001));

    // Cleanup
    std::remove(mortality_csv.c_str());
    std::remove(lapse_csv.c_str());
    std::remove(expense_csv.c_str());
}

// Note: Tests for resolve_from_am() would require a mock AssumptionsClient
// or integration testing with a running Assumptions Manager instance.
// For now, we test the populate_* methods indirectly through load_from_files.
