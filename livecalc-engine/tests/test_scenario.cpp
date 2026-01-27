#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <cmath>
#include <numeric>
#include <sstream>
#include "scenario.hpp"

using namespace livecalc;
using Catch::Matchers::WithinRel;
using Catch::Matchers::WithinAbs;

// ============================================================================
// Scenario Tests
// ============================================================================

TEST_CASE("Scenario default constructor initializes all rates to zero", "[scenario]") {
    Scenario scenario;

    REQUIRE(scenario.get_rate(1) == 0.0);
    REQUIRE(scenario.get_rate(25) == 0.0);
    REQUIRE(scenario.get_rate(50) == 0.0);
}

TEST_CASE("Scenario set and get rates", "[scenario]") {
    Scenario scenario;

    scenario.set_rate(1, 0.03);
    scenario.set_rate(25, 0.05);
    scenario.set_rate(50, 0.04);

    REQUIRE_THAT(scenario.get_rate(1), WithinRel(0.03, 1e-10));
    REQUIRE_THAT(scenario.get_rate(25), WithinRel(0.05, 1e-10));
    REQUIRE_THAT(scenario.get_rate(50), WithinRel(0.04, 1e-10));
}

TEST_CASE("Scenario boundary year 1", "[scenario][boundary]") {
    Scenario scenario;

    scenario.set_rate(1, 0.02);
    REQUIRE_THAT(scenario.get_rate(1), WithinRel(0.02, 1e-10));
}

TEST_CASE("Scenario boundary year 50", "[scenario][boundary]") {
    Scenario scenario;

    scenario.set_rate(50, 0.06);
    REQUIRE_THAT(scenario.get_rate(50), WithinRel(0.06, 1e-10));
}

TEST_CASE("Scenario year out of range throws", "[scenario][error]") {
    Scenario scenario;

    REQUIRE_THROWS_AS(scenario.set_rate(0, 0.03), std::out_of_range);
    REQUIRE_THROWS_AS(scenario.set_rate(51, 0.03), std::out_of_range);
    REQUIRE_THROWS_AS(scenario.get_rate(0), std::out_of_range);
    REQUIRE_THROWS_AS(scenario.get_rate(51), std::out_of_range);
}

TEST_CASE("Scenario allows negative interest rates", "[scenario]") {
    Scenario scenario;

    scenario.set_rate(1, -0.01);  // -1% negative rate
    REQUIRE_THAT(scenario.get_rate(1), WithinRel(-0.01, 1e-10));
}

TEST_CASE("Scenario discount factor for year 1", "[scenario][discount]") {
    Scenario scenario;
    scenario.set_rate(1, 0.05);  // 5% rate

    // Discount factor for year 1 = 1/(1+0.05) = 0.952381
    double expected = 1.0 / 1.05;
    REQUIRE_THAT(scenario.get_discount_factor(1), WithinRel(expected, 1e-10));
}

TEST_CASE("Scenario discount factor cumulative", "[scenario][discount]") {
    Scenario scenario;
    scenario.set_rate(1, 0.05);  // 5%
    scenario.set_rate(2, 0.04);  // 4%
    scenario.set_rate(3, 0.03);  // 3%

    // Discount factor for year 3 = 1/(1.05 * 1.04 * 1.03)
    double expected = 1.0 / (1.05 * 1.04 * 1.03);
    REQUIRE_THAT(scenario.get_discount_factor(3), WithinRel(expected, 1e-10));
}

TEST_CASE("Scenario discount factor boundary year 50", "[scenario][discount][boundary]") {
    Scenario scenario;
    // Set constant 3% rate for all years
    for (uint8_t y = 1; y <= 50; ++y) {
        scenario.set_rate(y, 0.03);
    }

    // Discount factor = 1/(1.03^50)
    double expected = std::pow(1.03, -50);
    REQUIRE_THAT(scenario.get_discount_factor(50), WithinRel(expected, 1e-8));
}

TEST_CASE("Scenario serialization round-trip", "[scenario][serialization]") {
    Scenario original;
    original.set_rate(1, 0.03);
    original.set_rate(25, 0.05);
    original.set_rate(50, 0.04);

    std::stringstream ss;
    original.serialize(ss);

    ss.seekg(0);
    Scenario restored = Scenario::deserialize(ss);

    REQUIRE_THAT(restored.get_rate(1), WithinRel(0.03, 1e-10));
    REQUIRE_THAT(restored.get_rate(25), WithinRel(0.05, 1e-10));
    REQUIRE_THAT(restored.get_rate(50), WithinRel(0.04, 1e-10));
}

TEST_CASE("Scenario serialized size is correct", "[scenario][serialization]") {
    // 50 years × 8 bytes = 400 bytes
    REQUIRE(Scenario::serialized_size() == 50 * sizeof(double));
    REQUIRE(Scenario::serialized_size() == 400);
}

// ============================================================================
// ScenarioGeneratorParams Tests
// ============================================================================

TEST_CASE("ScenarioGeneratorParams default constructor", "[generator]") {
    ScenarioGeneratorParams params;

    REQUIRE_THAT(params.initial_rate, WithinRel(0.03, 1e-10));
    REQUIRE_THAT(params.drift, WithinRel(0.0, 1e-10));
    REQUIRE_THAT(params.volatility, WithinRel(0.01, 1e-10));
    REQUIRE_THAT(params.min_rate, WithinRel(0.0, 1e-10));
    REQUIRE_THAT(params.max_rate, WithinRel(0.20, 1e-10));
}

TEST_CASE("ScenarioGeneratorParams parameterized constructor", "[generator]") {
    ScenarioGeneratorParams params(0.05, 0.01, 0.02, -0.01, 0.15);

    REQUIRE_THAT(params.initial_rate, WithinRel(0.05, 1e-10));
    REQUIRE_THAT(params.drift, WithinRel(0.01, 1e-10));
    REQUIRE_THAT(params.volatility, WithinRel(0.02, 1e-10));
    REQUIRE_THAT(params.min_rate, WithinRel(-0.01, 1e-10));
    REQUIRE_THAT(params.max_rate, WithinRel(0.15, 1e-10));
}

// ============================================================================
// ScenarioSet Tests
// ============================================================================

TEST_CASE("ScenarioSet default constructor creates empty set", "[scenarioset]") {
    ScenarioSet set;

    REQUIRE(set.empty());
    REQUIRE(set.size() == 0);
}

TEST_CASE("ScenarioSet add and get scenarios", "[scenarioset]") {
    ScenarioSet set;

    Scenario s1, s2;
    s1.set_rate(1, 0.03);
    s2.set_rate(1, 0.04);

    set.add(s1);
    set.add(s2);

    REQUIRE(set.size() == 2);
    REQUIRE_THAT(set.get(0).get_rate(1), WithinRel(0.03, 1e-10));
    REQUIRE_THAT(set.get(1).get_rate(1), WithinRel(0.04, 1e-10));
}

TEST_CASE("ScenarioSet index out of range throws", "[scenarioset][error]") {
    ScenarioSet set;

    REQUIRE_THROWS_AS(set.get(0), std::out_of_range);

    Scenario s;
    set.add(s);
    REQUIRE_THROWS_AS(set.get(1), std::out_of_range);
}

TEST_CASE("ScenarioSet reserve capacity", "[scenarioset]") {
    ScenarioSet set;
    set.reserve(1000);

    // Can add scenarios without reallocation
    for (size_t i = 0; i < 1000; ++i) {
        set.add(Scenario());
    }
    REQUIRE(set.size() == 1000);
}

TEST_CASE("ScenarioSet clear removes all scenarios", "[scenarioset]") {
    ScenarioSet set;
    set.add(Scenario());
    set.add(Scenario());

    set.clear();
    REQUIRE(set.empty());
}

// ============================================================================
// Scenario Generation Tests
// ============================================================================

TEST_CASE("ScenarioSet generate creates correct number of scenarios", "[generator]") {
    ScenarioGeneratorParams params;
    ScenarioSet set = ScenarioSet::generate(100, params, 42);

    REQUIRE(set.size() == 100);
}

TEST_CASE("ScenarioSet generate with same seed produces identical results", "[generator][seed]") {
    ScenarioGeneratorParams params;

    ScenarioSet set1 = ScenarioSet::generate(10, params, 12345);
    ScenarioSet set2 = ScenarioSet::generate(10, params, 12345);

    for (size_t i = 0; i < 10; ++i) {
        for (uint8_t year = 1; year <= 50; ++year) {
            REQUIRE_THAT(set1.get(i).get_rate(year),
                        WithinRel(set2.get(i).get_rate(year), 1e-10));
        }
    }
}

TEST_CASE("ScenarioSet generate with different seeds produces different results", "[generator][seed]") {
    ScenarioGeneratorParams params;

    ScenarioSet set1 = ScenarioSet::generate(10, params, 12345);
    ScenarioSet set2 = ScenarioSet::generate(10, params, 54321);

    // Check that at least one rate differs
    bool has_difference = false;
    for (size_t i = 0; i < 10 && !has_difference; ++i) {
        for (uint8_t year = 1; year <= 50 && !has_difference; ++year) {
            if (std::abs(set1.get(i).get_rate(year) - set2.get(i).get_rate(year)) > 1e-10) {
                has_difference = true;
            }
        }
    }
    REQUIRE(has_difference);
}

TEST_CASE("ScenarioSet generate respects min/max bounds", "[generator][bounds]") {
    ScenarioGeneratorParams params(0.05, 0.0, 0.10, 0.01, 0.10);  // High volatility

    ScenarioSet set = ScenarioSet::generate(100, params, 42);

    for (size_t i = 0; i < set.size(); ++i) {
        for (uint8_t year = 1; year <= 50; ++year) {
            double rate = set.get(i).get_rate(year);
            REQUIRE(rate >= 0.01 - 1e-10);  // min_rate
            REQUIRE(rate <= 0.10 + 1e-10);  // max_rate
        }
    }
}

TEST_CASE("ScenarioSet generate produces expected distribution mean", "[generator][distribution]") {
    // With zero drift and zero volatility, all rates should equal initial rate
    ScenarioGeneratorParams params(0.04, 0.0, 0.0, 0.0, 0.20);

    ScenarioSet set = ScenarioSet::generate(100, params, 42);

    for (size_t i = 0; i < set.size(); ++i) {
        for (uint8_t year = 1; year <= 50; ++year) {
            REQUIRE_THAT(set.get(i).get_rate(year), WithinRel(0.04, 1e-10));
        }
    }
}

TEST_CASE("ScenarioSet generate GBM produces reasonable distribution", "[generator][distribution]") {
    // Generate many scenarios and check distribution properties
    ScenarioGeneratorParams params(0.03, 0.0, 0.01, 0.0, 0.20);

    ScenarioSet set = ScenarioSet::generate(1000, params, 42);

    // Collect year 10 rates for distribution analysis
    std::vector<double> year10_rates;
    for (size_t i = 0; i < set.size(); ++i) {
        year10_rates.push_back(set.get(i).get_rate(10));
    }

    // Calculate mean
    double sum = std::accumulate(year10_rates.begin(), year10_rates.end(), 0.0);
    double mean = sum / year10_rates.size();

    // Mean should be close to initial rate (GBM with zero drift)
    // Allow some tolerance due to volatility effects
    REQUIRE_THAT(mean, WithinAbs(0.03, 0.01));

    // Calculate standard deviation
    double sq_sum = 0.0;
    for (double r : year10_rates) {
        sq_sum += (r - mean) * (r - mean);
    }
    double std_dev = std::sqrt(sq_sum / year10_rates.size());

    // Standard deviation should be non-zero (volatility effect)
    REQUIRE(std_dev > 0.0005);

    // Standard deviation shouldn't be too large
    REQUIRE(std_dev < 0.02);
}

TEST_CASE("ScenarioSet generate can create 10000 scenarios", "[generator][capacity]") {
    ScenarioGeneratorParams params;

    ScenarioSet set = ScenarioSet::generate(10000, params, 42);

    REQUIRE(set.size() == 10000);
}

// ============================================================================
// CSV Loading Tests
// ============================================================================

TEST_CASE("ScenarioSet CSV loading wide format", "[scenarioset][csv]") {
    std::stringstream csv;
    csv << "scenario_id,year_1,year_2,year_3\n";
    csv << "1,0.03,0.04,0.05\n";
    csv << "2,0.02,0.03,0.04\n";

    ScenarioSet set = ScenarioSet::load_from_csv(csv);

    REQUIRE(set.size() == 2);
    REQUIRE_THAT(set.get(0).get_rate(1), WithinRel(0.03, 1e-10));
    REQUIRE_THAT(set.get(0).get_rate(2), WithinRel(0.04, 1e-10));
    REQUIRE_THAT(set.get(0).get_rate(3), WithinRel(0.05, 1e-10));
    REQUIRE_THAT(set.get(1).get_rate(1), WithinRel(0.02, 1e-10));
}

TEST_CASE("ScenarioSet CSV loading long format", "[scenarioset][csv]") {
    std::stringstream csv;
    csv << "scenario_id,year,rate\n";
    csv << "1,1,0.03\n";
    csv << "1,2,0.04\n";
    csv << "1,3,0.05\n";
    csv << "2,1,0.02\n";
    csv << "2,2,0.03\n";
    csv << "2,3,0.04\n";

    ScenarioSet set = ScenarioSet::load_from_csv(csv);

    REQUIRE(set.size() == 2);
    REQUIRE_THAT(set.get(0).get_rate(1), WithinRel(0.03, 1e-10));
    REQUIRE_THAT(set.get(0).get_rate(2), WithinRel(0.04, 1e-10));
    REQUIRE_THAT(set.get(0).get_rate(3), WithinRel(0.05, 1e-10));
    REQUIRE_THAT(set.get(1).get_rate(1), WithinRel(0.02, 1e-10));
}

TEST_CASE("ScenarioSet CSV loading empty file throws", "[scenarioset][csv][error]") {
    std::stringstream csv;

    REQUIRE_THROWS_AS(ScenarioSet::load_from_csv(csv), std::runtime_error);
}

// ============================================================================
// Serialization Tests
// ============================================================================

TEST_CASE("ScenarioSet serialization round-trip", "[scenarioset][serialization]") {
    ScenarioSet original;

    Scenario s1, s2;
    s1.set_rate(1, 0.03);
    s1.set_rate(50, 0.05);
    s2.set_rate(1, 0.04);
    s2.set_rate(50, 0.06);

    original.add(s1);
    original.add(s2);

    std::stringstream ss;
    original.serialize(ss);

    ss.seekg(0);
    ScenarioSet restored = ScenarioSet::deserialize(ss);

    REQUIRE(restored.size() == 2);
    REQUIRE_THAT(restored.get(0).get_rate(1), WithinRel(0.03, 1e-10));
    REQUIRE_THAT(restored.get(0).get_rate(50), WithinRel(0.05, 1e-10));
    REQUIRE_THAT(restored.get(1).get_rate(1), WithinRel(0.04, 1e-10));
    REQUIRE_THAT(restored.get(1).get_rate(50), WithinRel(0.06, 1e-10));
}

TEST_CASE("ScenarioSet generated scenarios round-trip serialization", "[scenarioset][serialization]") {
    ScenarioGeneratorParams params(0.03, 0.01, 0.02, 0.0, 0.20);
    ScenarioSet original = ScenarioSet::generate(100, params, 42);

    std::stringstream ss;
    original.serialize(ss);

    ss.seekg(0);
    ScenarioSet restored = ScenarioSet::deserialize(ss);

    REQUIRE(restored.size() == 100);

    // Verify all rates match
    for (size_t i = 0; i < 100; ++i) {
        for (uint8_t year = 1; year <= 50; ++year) {
            REQUIRE_THAT(restored.get(i).get_rate(year),
                        WithinRel(original.get(i).get_rate(year), 1e-10));
        }
    }
}

TEST_CASE("ScenarioSet memory footprint helper", "[scenarioset]") {
    // bytes_per_scenario should match Scenario size
    REQUIRE(ScenarioSet::bytes_per_scenario() == sizeof(Scenario));

    ScenarioSet set;
    set.reserve(1000);

    // Memory footprint includes the vector overhead plus capacity * sizeof(Scenario)
    size_t footprint = set.memory_footprint();
    REQUIRE(footprint >= 1000 * sizeof(Scenario));
}

// ============================================================================
// Parquet Loading Tests
// ============================================================================

#ifdef HAVE_ARROW

TEST_CASE("ScenarioSet Parquet loading wide format", "[scenarioset][parquet]") {
    // This test requires a Parquet file created externally
    // For now, we test that the function throws when file doesn't exist
    REQUIRE_THROWS_AS(ScenarioSet::load_from_parquet("nonexistent.parquet"), std::runtime_error);
}

TEST_CASE("ScenarioSet Parquet loading long format", "[scenarioset][parquet]") {
    // This test requires a Parquet file created externally
    // For now, we test that the function throws when file doesn't exist
    REQUIRE_THROWS_AS(ScenarioSet::load_from_parquet("nonexistent_long.parquet"), std::runtime_error);
}

#else

TEST_CASE("ScenarioSet Parquet loading throws when Arrow not available", "[scenarioset][parquet]") {
    REQUIRE_THROWS_AS(ScenarioSet::load_from_parquet("test.parquet"), std::runtime_error);
}

#endif // HAVE_ARROW
