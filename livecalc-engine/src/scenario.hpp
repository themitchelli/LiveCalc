#ifndef LIVECALC_SCENARIO_HPP
#define LIVECALC_SCENARIO_HPP

#include <array>
#include <cstdint>
#include <istream>
#include <ostream>
#include <random>
#include <string>
#include <vector>

namespace livecalc {

// Scenario: economic scenario with interest rates by year (1-50)
// Represents one path through the interest rate space
class Scenario {
public:
    static constexpr size_t MAX_YEAR = 50;
    static constexpr size_t NUM_YEARS = MAX_YEAR;  // Years 1 to 50

    Scenario();

    // Set/get interest rate for a specific year (1-50)
    void set_rate(uint8_t year, double rate);
    double get_rate(uint8_t year) const;

    // Get discount factor for a specific year (cumulative product of 1/(1+r))
    double get_discount_factor(uint8_t year) const;

    // Binary serialization for WASM
    void serialize(std::ostream& os) const;
    static Scenario deserialize(std::istream& is);

    static constexpr size_t serialized_size() {
        return NUM_YEARS * sizeof(double);
    }

private:
    // rates_[year-1] = interest rate for that year (0-indexed internally)
    std::array<double, NUM_YEARS> rates_;
};

// Parameters for Geometric Brownian Motion scenario generation
struct ScenarioGeneratorParams {
    double initial_rate;    // Starting interest rate (e.g., 0.03 for 3%)
    double drift;           // Annual drift (e.g., 0.0 for no trend)
    double volatility;      // Annual volatility (e.g., 0.01 for 1%)
    double min_rate;        // Floor for interest rates (e.g., 0.0 or -0.01)
    double max_rate;        // Ceiling for interest rates (e.g., 0.20)

    ScenarioGeneratorParams();
    ScenarioGeneratorParams(double init, double d, double vol,
                            double min = 0.0, double max = 0.20);
};

// ScenarioSet: collection of scenarios for stochastic valuation
class ScenarioSet {
public:
    ScenarioSet();

    // Add scenarios
    void add(const Scenario& scenario);
    void add(Scenario&& scenario);

    // Access scenarios
    const Scenario& get(size_t index) const;
    size_t size() const;
    bool empty() const;

    const std::vector<Scenario>& scenarios() const { return scenarios_; }
    std::vector<Scenario>& scenarios() { return scenarios_; }

    void reserve(size_t count);
    void clear();

    // Generate scenarios using Geometric Brownian Motion
    // Seed provides reproducibility
    static ScenarioSet generate(size_t num_scenarios,
                                const ScenarioGeneratorParams& params,
                                uint64_t seed);

    // Load from CSV: expects columns scenario_id,year_1,year_2,...,year_50
    // or scenario_id,year,rate (long format)
    static ScenarioSet load_from_csv(const std::string& filepath);
    static ScenarioSet load_from_csv(std::istream& is);

    // Binary serialization for WASM
    void serialize(std::ostream& os) const;
    static ScenarioSet deserialize(std::istream& is);

    // Memory footprint helpers
    static constexpr size_t bytes_per_scenario() {
        return sizeof(Scenario);
    }

    size_t memory_footprint() const {
        return sizeof(ScenarioSet) + scenarios_.capacity() * sizeof(Scenario);
    }

private:
    std::vector<Scenario> scenarios_;
};

} // namespace livecalc

#endif // LIVECALC_SCENARIO_HPP
