#include "scenario.hpp"
#include "io/csv_reader.hpp"
#include <algorithm>
#include <cmath>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <unordered_map>

namespace livecalc {

// ============================================================================
// Scenario Implementation
// ============================================================================

Scenario::Scenario() {
    rates_.fill(0.0);
}

void Scenario::set_rate(uint8_t year, double rate) {
    if (year < 1 || year > MAX_YEAR) {
        throw std::out_of_range("Year must be between 1 and 50");
    }
    rates_[year - 1] = rate;
}

double Scenario::get_rate(uint8_t year) const {
    if (year < 1 || year > MAX_YEAR) {
        throw std::out_of_range("Year must be between 1 and 50");
    }
    return rates_[year - 1];
}

double Scenario::get_discount_factor(uint8_t year) const {
    if (year < 1 || year > MAX_YEAR) {
        throw std::out_of_range("Year must be between 1 and 50");
    }
    double factor = 1.0;
    for (uint8_t y = 1; y <= year; ++y) {
        factor /= (1.0 + rates_[y - 1]);
    }
    return factor;
}

void Scenario::serialize(std::ostream& os) const {
    os.write(reinterpret_cast<const char*>(rates_.data()),
             NUM_YEARS * sizeof(double));
}

Scenario Scenario::deserialize(std::istream& is) {
    Scenario scenario;
    is.read(reinterpret_cast<char*>(scenario.rates_.data()),
            NUM_YEARS * sizeof(double));
    if (!is) {
        throw std::runtime_error("Failed to deserialize Scenario");
    }
    return scenario;
}

// ============================================================================
// ScenarioGeneratorParams Implementation
// ============================================================================

ScenarioGeneratorParams::ScenarioGeneratorParams()
    : initial_rate(0.03), drift(0.0), volatility(0.01),
      min_rate(0.0), max_rate(0.20) {}

ScenarioGeneratorParams::ScenarioGeneratorParams(
    double init, double d, double vol, double min, double max)
    : initial_rate(init), drift(d), volatility(vol),
      min_rate(min), max_rate(max) {}

// ============================================================================
// ScenarioSet Implementation
// ============================================================================

ScenarioSet::ScenarioSet() = default;

void ScenarioSet::add(const Scenario& scenario) {
    scenarios_.push_back(scenario);
}

void ScenarioSet::add(Scenario&& scenario) {
    scenarios_.push_back(std::move(scenario));
}

const Scenario& ScenarioSet::get(size_t index) const {
    if (index >= scenarios_.size()) {
        throw std::out_of_range("Scenario index out of range");
    }
    return scenarios_[index];
}

size_t ScenarioSet::size() const {
    return scenarios_.size();
}

bool ScenarioSet::empty() const {
    return scenarios_.empty();
}

void ScenarioSet::reserve(size_t count) {
    scenarios_.reserve(count);
}

void ScenarioSet::clear() {
    scenarios_.clear();
}

ScenarioSet ScenarioSet::generate(size_t num_scenarios,
                                  const ScenarioGeneratorParams& params,
                                  uint64_t seed) {
    ScenarioSet set;
    set.reserve(num_scenarios);

    // Use Mersenne Twister for high-quality random numbers
    std::mt19937_64 rng(seed);
    std::normal_distribution<double> normal(0.0, 1.0);

    for (size_t i = 0; i < num_scenarios; ++i) {
        Scenario scenario;
        double rate = params.initial_rate;

        for (uint8_t year = 1; year <= Scenario::MAX_YEAR; ++year) {
            // Geometric Brownian Motion: dS = mu*S*dt + sigma*S*dW
            // Discrete: S(t+1) = S(t) * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z)
            // For dt=1 year: S(t+1) = S(t) * exp((mu - 0.5*sigma^2) + sigma*Z)
            double z = normal(rng);
            double drift_term = params.drift - 0.5 * params.volatility * params.volatility;
            double diffusion_term = params.volatility * z;
            rate = rate * std::exp(drift_term + diffusion_term);

            // Clamp to min/max bounds
            rate = std::max(params.min_rate, std::min(params.max_rate, rate));

            scenario.set_rate(year, rate);
        }

        set.add(std::move(scenario));
    }

    return set;
}

ScenarioSet ScenarioSet::load_from_csv(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file) {
        throw std::runtime_error("Cannot open file: " + filepath);
    }
    return load_from_csv(file);
}

ScenarioSet ScenarioSet::load_from_csv(std::istream& is) {
    CsvReader reader(is);

    // Read header to determine format
    auto header = reader.read_row();
    if (header.empty()) {
        throw std::runtime_error("Empty CSV file");
    }

    // Detect format: wide (scenario_id,year_1,...,year_50) or long (scenario_id,year,rate)
    bool is_long_format = false;
    if (header.size() == 3) {
        // Check if columns are scenario_id,year,rate
        std::string h1 = header[1];
        std::transform(h1.begin(), h1.end(), h1.begin(), ::tolower);
        if (h1 == "year") {
            is_long_format = true;
        }
    }

    ScenarioSet set;

    if (is_long_format) {
        // Long format: scenario_id,year,rate
        // Need to group by scenario_id
        std::unordered_map<size_t, Scenario> scenario_map;

        while (reader.has_more()) {
            auto row = reader.read_row();
            if (row.size() < 3) continue;

            size_t scenario_id = std::stoull(row[0]);
            uint8_t year = static_cast<uint8_t>(std::stoi(row[1]));
            double rate = std::stod(row[2]);

            if (scenario_map.find(scenario_id) == scenario_map.end()) {
                scenario_map[scenario_id] = Scenario();
            }
            scenario_map[scenario_id].set_rate(year, rate);
        }

        // Convert map to vector (sorted by scenario_id)
        std::vector<std::pair<size_t, Scenario>> sorted_scenarios(
            scenario_map.begin(), scenario_map.end());
        std::sort(sorted_scenarios.begin(), sorted_scenarios.end(),
                  [](const auto& a, const auto& b) { return a.first < b.first; });

        for (auto& pair : sorted_scenarios) {
            set.add(std::move(pair.second));
        }
    } else {
        // Wide format: scenario_id,year_1,year_2,...,year_50
        while (reader.has_more()) {
            auto row = reader.read_row();
            if (row.size() < 2) continue;

            Scenario scenario;
            for (size_t i = 1; i < row.size() && i <= Scenario::MAX_YEAR; ++i) {
                double rate = std::stod(row[i]);
                scenario.set_rate(static_cast<uint8_t>(i), rate);
            }
            set.add(std::move(scenario));
        }
    }

    return set;
}

void ScenarioSet::serialize(std::ostream& os) const {
    // Write count as uint32_t
    uint32_t count = static_cast<uint32_t>(scenarios_.size());
    os.write(reinterpret_cast<const char*>(&count), sizeof(count));

    // Write each scenario
    for (const auto& scenario : scenarios_) {
        scenario.serialize(os);
    }
}

ScenarioSet ScenarioSet::deserialize(std::istream& is) {
    ScenarioSet set;

    // Read count
    uint32_t count;
    is.read(reinterpret_cast<char*>(&count), sizeof(count));
    if (!is) {
        throw std::runtime_error("Failed to read scenario count");
    }

    set.reserve(count);
    for (uint32_t i = 0; i < count; ++i) {
        set.add(Scenario::deserialize(is));
    }

    return set;
}

} // namespace livecalc
