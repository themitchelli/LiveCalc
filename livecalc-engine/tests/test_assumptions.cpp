#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <sstream>
#include "assumptions.hpp"

using namespace livecalc;
using Catch::Matchers::WithinRel;

// ============================================================================
// MortalityTable Tests
// ============================================================================

TEST_CASE("MortalityTable default constructor initializes all rates to zero", "[mortality]") {
    MortalityTable table;

    REQUIRE(table.get_qx(0, Gender::Male) == 0.0);
    REQUIRE(table.get_qx(50, Gender::Male) == 0.0);
    REQUIRE(table.get_qx(120, Gender::Male) == 0.0);
    REQUIRE(table.get_qx(0, Gender::Female) == 0.0);
    REQUIRE(table.get_qx(50, Gender::Female) == 0.0);
    REQUIRE(table.get_qx(120, Gender::Female) == 0.0);
}

TEST_CASE("MortalityTable set and get qx rates", "[mortality]") {
    MortalityTable table;

    table.set_qx(30, Gender::Male, 0.001);
    table.set_qx(30, Gender::Female, 0.0008);

    REQUIRE_THAT(table.get_qx(30, Gender::Male), WithinRel(0.001, 1e-10));
    REQUIRE_THAT(table.get_qx(30, Gender::Female), WithinRel(0.0008, 1e-10));
}

TEST_CASE("MortalityTable boundary age 0", "[mortality][boundary]") {
    MortalityTable table;

    table.set_qx(0, Gender::Male, 0.005);
    table.set_qx(0, Gender::Female, 0.004);

    REQUIRE_THAT(table.get_qx(0, Gender::Male), WithinRel(0.005, 1e-10));
    REQUIRE_THAT(table.get_qx(0, Gender::Female), WithinRel(0.004, 1e-10));
}

TEST_CASE("MortalityTable boundary age 120", "[mortality][boundary]") {
    MortalityTable table;

    table.set_qx(120, Gender::Male, 1.0);
    table.set_qx(120, Gender::Female, 1.0);

    REQUIRE_THAT(table.get_qx(120, Gender::Male), WithinRel(1.0, 1e-10));
    REQUIRE_THAT(table.get_qx(120, Gender::Female), WithinRel(1.0, 1e-10));
}

TEST_CASE("MortalityTable age out of range throws", "[mortality][error]") {
    MortalityTable table;

    REQUIRE_THROWS_AS(table.set_qx(121, Gender::Male, 0.5), std::out_of_range);
    REQUIRE_THROWS_AS(table.get_qx(121, Gender::Male), std::out_of_range);
    REQUIRE_THROWS_AS(table.get_qx(255, Gender::Female), std::out_of_range);
}

TEST_CASE("MortalityTable invalid qx value throws", "[mortality][error]") {
    MortalityTable table;

    REQUIRE_THROWS_AS(table.set_qx(30, Gender::Male, -0.1), std::invalid_argument);
    REQUIRE_THROWS_AS(table.set_qx(30, Gender::Male, 1.1), std::invalid_argument);
}

TEST_CASE("MortalityTable multiplier adjusts rates", "[mortality][multiplier]") {
    MortalityTable table;
    table.set_qx(50, Gender::Male, 0.01);

    // 1.1x multiplier
    REQUIRE_THAT(table.get_qx(50, Gender::Male, 1.1), WithinRel(0.011, 1e-10));

    // 0.5x multiplier
    REQUIRE_THAT(table.get_qx(50, Gender::Male, 0.5), WithinRel(0.005, 1e-10));
}

TEST_CASE("MortalityTable multiplier caps at 1.0", "[mortality][multiplier]") {
    MortalityTable table;
    table.set_qx(100, Gender::Male, 0.8);

    // 2x multiplier would give 1.6, but should cap at 1.0
    REQUIRE_THAT(table.get_qx(100, Gender::Male, 2.0), WithinRel(1.0, 1e-10));
}

TEST_CASE("MortalityTable CSV loading", "[mortality][csv]") {
    std::stringstream csv;
    csv << "age,male_qx,female_qx\n";
    csv << "0,0.00500,0.00400\n";
    csv << "30,0.00100,0.00080\n";
    csv << "60,0.01000,0.00800\n";
    csv << "120,1.00000,1.00000\n";

    MortalityTable table = MortalityTable::load_from_csv(csv);

    REQUIRE_THAT(table.get_qx(0, Gender::Male), WithinRel(0.005, 1e-10));
    REQUIRE_THAT(table.get_qx(0, Gender::Female), WithinRel(0.004, 1e-10));
    REQUIRE_THAT(table.get_qx(30, Gender::Male), WithinRel(0.001, 1e-10));
    REQUIRE_THAT(table.get_qx(30, Gender::Female), WithinRel(0.0008, 1e-10));
    REQUIRE_THAT(table.get_qx(60, Gender::Male), WithinRel(0.01, 1e-10));
    REQUIRE_THAT(table.get_qx(120, Gender::Male), WithinRel(1.0, 1e-10));
}

TEST_CASE("MortalityTable serialization round-trip", "[mortality][serialization]") {
    MortalityTable original;
    original.set_qx(0, Gender::Male, 0.005);
    original.set_qx(0, Gender::Female, 0.004);
    original.set_qx(50, Gender::Male, 0.008);
    original.set_qx(50, Gender::Female, 0.006);
    original.set_qx(120, Gender::Male, 1.0);
    original.set_qx(120, Gender::Female, 1.0);

    std::stringstream ss;
    original.serialize(ss);

    ss.seekg(0);
    MortalityTable restored = MortalityTable::deserialize(ss);

    REQUIRE_THAT(restored.get_qx(0, Gender::Male), WithinRel(0.005, 1e-10));
    REQUIRE_THAT(restored.get_qx(0, Gender::Female), WithinRel(0.004, 1e-10));
    REQUIRE_THAT(restored.get_qx(50, Gender::Male), WithinRel(0.008, 1e-10));
    REQUIRE_THAT(restored.get_qx(50, Gender::Female), WithinRel(0.006, 1e-10));
    REQUIRE_THAT(restored.get_qx(120, Gender::Male), WithinRel(1.0, 1e-10));
    REQUIRE_THAT(restored.get_qx(120, Gender::Female), WithinRel(1.0, 1e-10));
}

TEST_CASE("MortalityTable serialized size is correct", "[mortality][serialization]") {
    // 121 ages × 2 genders × 8 bytes = 1936 bytes
    REQUIRE(MortalityTable::serialized_size() == 121 * 2 * sizeof(double));
    REQUIRE(MortalityTable::serialized_size() == 1936);
}

// ============================================================================
// LapseTable Tests
// ============================================================================

TEST_CASE("LapseTable default constructor initializes all rates to zero", "[lapse]") {
    LapseTable table;

    REQUIRE(table.get_rate(1) == 0.0);
    REQUIRE(table.get_rate(25) == 0.0);
    REQUIRE(table.get_rate(50) == 0.0);
}

TEST_CASE("LapseTable set and get rates", "[lapse]") {
    LapseTable table;

    table.set_rate(1, 0.15);
    table.set_rate(10, 0.03);

    REQUIRE_THAT(table.get_rate(1), WithinRel(0.15, 1e-10));
    REQUIRE_THAT(table.get_rate(10), WithinRel(0.03, 1e-10));
}

TEST_CASE("LapseTable boundary year 1", "[lapse][boundary]") {
    LapseTable table;

    table.set_rate(1, 0.20);
    REQUIRE_THAT(table.get_rate(1), WithinRel(0.20, 1e-10));
}

TEST_CASE("LapseTable boundary year 50", "[lapse][boundary]") {
    LapseTable table;

    table.set_rate(50, 0.01);
    REQUIRE_THAT(table.get_rate(50), WithinRel(0.01, 1e-10));
}

TEST_CASE("LapseTable year out of range throws", "[lapse][error]") {
    LapseTable table;

    REQUIRE_THROWS_AS(table.set_rate(0, 0.1), std::out_of_range);
    REQUIRE_THROWS_AS(table.set_rate(51, 0.1), std::out_of_range);
    REQUIRE_THROWS_AS(table.get_rate(0), std::out_of_range);
    REQUIRE_THROWS_AS(table.get_rate(51), std::out_of_range);
}

TEST_CASE("LapseTable invalid rate throws", "[lapse][error]") {
    LapseTable table;

    REQUIRE_THROWS_AS(table.set_rate(1, -0.1), std::invalid_argument);
    REQUIRE_THROWS_AS(table.set_rate(1, 1.1), std::invalid_argument);
}

TEST_CASE("LapseTable multiplier adjusts rates", "[lapse][multiplier]") {
    LapseTable table;
    table.set_rate(5, 0.10);

    REQUIRE_THAT(table.get_rate(5, 1.5), WithinRel(0.15, 1e-10));
    REQUIRE_THAT(table.get_rate(5, 0.5), WithinRel(0.05, 1e-10));
}

TEST_CASE("LapseTable multiplier caps at 1.0", "[lapse][multiplier]") {
    LapseTable table;
    table.set_rate(1, 0.8);

    REQUIRE_THAT(table.get_rate(1, 2.0), WithinRel(1.0, 1e-10));
}

TEST_CASE("LapseTable CSV loading", "[lapse][csv]") {
    std::stringstream csv;
    csv << "year,lapse_rate\n";
    csv << "1,0.15\n";
    csv << "2,0.10\n";
    csv << "5,0.05\n";
    csv << "10,0.03\n";
    csv << "50,0.01\n";

    LapseTable table = LapseTable::load_from_csv(csv);

    REQUIRE_THAT(table.get_rate(1), WithinRel(0.15, 1e-10));
    REQUIRE_THAT(table.get_rate(2), WithinRel(0.10, 1e-10));
    REQUIRE_THAT(table.get_rate(5), WithinRel(0.05, 1e-10));
    REQUIRE_THAT(table.get_rate(10), WithinRel(0.03, 1e-10));
    REQUIRE_THAT(table.get_rate(50), WithinRel(0.01, 1e-10));
}

TEST_CASE("LapseTable serialization round-trip", "[lapse][serialization]") {
    LapseTable original;
    original.set_rate(1, 0.15);
    original.set_rate(25, 0.05);
    original.set_rate(50, 0.01);

    std::stringstream ss;
    original.serialize(ss);

    ss.seekg(0);
    LapseTable restored = LapseTable::deserialize(ss);

    REQUIRE_THAT(restored.get_rate(1), WithinRel(0.15, 1e-10));
    REQUIRE_THAT(restored.get_rate(25), WithinRel(0.05, 1e-10));
    REQUIRE_THAT(restored.get_rate(50), WithinRel(0.01, 1e-10));
}

TEST_CASE("LapseTable serialized size is correct", "[lapse][serialization]") {
    // 50 years × 8 bytes = 400 bytes
    REQUIRE(LapseTable::serialized_size() == 50 * sizeof(double));
    REQUIRE(LapseTable::serialized_size() == 400);
}

// ============================================================================
// ExpenseAssumptions Tests
// ============================================================================

TEST_CASE("ExpenseAssumptions default constructor initializes to zero", "[expenses]") {
    ExpenseAssumptions expenses;

    REQUIRE(expenses.per_policy_acquisition == 0.0);
    REQUIRE(expenses.per_policy_maintenance == 0.0);
    REQUIRE(expenses.percent_of_premium == 0.0);
    REQUIRE(expenses.claim_expense == 0.0);
}

TEST_CASE("ExpenseAssumptions parameterized constructor", "[expenses]") {
    ExpenseAssumptions expenses(500.0, 50.0, 0.05, 100.0);

    REQUIRE_THAT(expenses.per_policy_acquisition, WithinRel(500.0, 1e-10));
    REQUIRE_THAT(expenses.per_policy_maintenance, WithinRel(50.0, 1e-10));
    REQUIRE_THAT(expenses.percent_of_premium, WithinRel(0.05, 1e-10));
    REQUIRE_THAT(expenses.claim_expense, WithinRel(100.0, 1e-10));
}

TEST_CASE("ExpenseAssumptions equality operator", "[expenses]") {
    ExpenseAssumptions a(500.0, 50.0, 0.05, 100.0);
    ExpenseAssumptions b(500.0, 50.0, 0.05, 100.0);
    ExpenseAssumptions c(600.0, 50.0, 0.05, 100.0);

    REQUIRE(a == b);
    REQUIRE_FALSE(a == c);
}

TEST_CASE("ExpenseAssumptions first year expense calculation", "[expenses]") {
    ExpenseAssumptions expenses(500.0, 50.0, 0.05, 100.0);
    double premium = 1000.0;

    // First year = acquisition + maintenance + percent*premium
    // = 500 + 50 + (0.05 * 1000) = 600
    REQUIRE_THAT(expenses.first_year_expense(premium), WithinRel(600.0, 1e-10));
}

TEST_CASE("ExpenseAssumptions renewal expense calculation", "[expenses]") {
    ExpenseAssumptions expenses(500.0, 50.0, 0.05, 100.0);
    double premium = 1000.0;

    // Renewal = maintenance + percent*premium
    // = 50 + (0.05 * 1000) = 100
    REQUIRE_THAT(expenses.renewal_expense(premium), WithinRel(100.0, 1e-10));
}

TEST_CASE("ExpenseAssumptions expense with multiplier", "[expenses][multiplier]") {
    ExpenseAssumptions expenses(500.0, 50.0, 0.05, 100.0);
    double premium = 1000.0;

    // First year with 1.2x multiplier = 600 * 1.2 = 720
    REQUIRE_THAT(expenses.first_year_expense(premium, 1.2), WithinRel(720.0, 1e-10));

    // Renewal with 0.8x multiplier = 100 * 0.8 = 80
    REQUIRE_THAT(expenses.renewal_expense(premium, 0.8), WithinRel(80.0, 1e-10));
}

TEST_CASE("ExpenseAssumptions CSV loading", "[expenses][csv]") {
    std::stringstream csv;
    csv << "name,value\n";
    csv << "per_policy_acquisition,500\n";
    csv << "per_policy_maintenance,50\n";
    csv << "percent_of_premium,0.05\n";
    csv << "claim_expense,100\n";

    ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv(csv);

    REQUIRE_THAT(expenses.per_policy_acquisition, WithinRel(500.0, 1e-10));
    REQUIRE_THAT(expenses.per_policy_maintenance, WithinRel(50.0, 1e-10));
    REQUIRE_THAT(expenses.percent_of_premium, WithinRel(0.05, 1e-10));
    REQUIRE_THAT(expenses.claim_expense, WithinRel(100.0, 1e-10));
}

TEST_CASE("ExpenseAssumptions CSV loading with alternate names", "[expenses][csv]") {
    std::stringstream csv;
    csv << "name,value\n";
    csv << "acquisition,500\n";
    csv << "maintenance,50\n";
    csv << "premium_percent,0.05\n";
    csv << "claim,100\n";

    ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv(csv);

    REQUIRE_THAT(expenses.per_policy_acquisition, WithinRel(500.0, 1e-10));
    REQUIRE_THAT(expenses.per_policy_maintenance, WithinRel(50.0, 1e-10));
    REQUIRE_THAT(expenses.percent_of_premium, WithinRel(0.05, 1e-10));
    REQUIRE_THAT(expenses.claim_expense, WithinRel(100.0, 1e-10));
}

TEST_CASE("ExpenseAssumptions serialization round-trip", "[expenses][serialization]") {
    ExpenseAssumptions original(500.0, 50.0, 0.05, 100.0);

    std::stringstream ss;
    original.serialize(ss);

    ss.seekg(0);
    ExpenseAssumptions restored = ExpenseAssumptions::deserialize(ss);

    REQUIRE(original == restored);
}

TEST_CASE("ExpenseAssumptions serialized size is correct", "[expenses][serialization]") {
    // 4 doubles × 8 bytes = 32 bytes
    REQUIRE(ExpenseAssumptions::serialized_size() == 4 * sizeof(double));
    REQUIRE(ExpenseAssumptions::serialized_size() == 32);
}
