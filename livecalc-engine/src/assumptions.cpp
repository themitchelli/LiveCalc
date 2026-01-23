#include "assumptions.hpp"
#include "io/csv_reader.hpp"
#include <fstream>
#include <stdexcept>
#include <algorithm>
#include <cmath>

namespace livecalc {

// ============================================================================
// MortalityTable Implementation
// ============================================================================

MortalityTable::MortalityTable() {
    // Initialize all rates to 0.0
    for (auto& gender_rates : rates_) {
        gender_rates.fill(0.0);
    }
}

void MortalityTable::set_qx(uint8_t age, Gender gender, double qx) {
    if (age > MAX_AGE) {
        throw std::out_of_range("Age " + std::to_string(age) + " exceeds maximum age " + std::to_string(MAX_AGE));
    }
    if (qx < 0.0 || qx > 1.0) {
        throw std::invalid_argument("qx must be between 0.0 and 1.0");
    }
    rates_[static_cast<size_t>(gender)][age] = qx;
}

double MortalityTable::get_qx(uint8_t age, Gender gender) const {
    if (age > MAX_AGE) {
        throw std::out_of_range("Age " + std::to_string(age) + " exceeds maximum age " + std::to_string(MAX_AGE));
    }
    return rates_[static_cast<size_t>(gender)][age];
}

double MortalityTable::get_qx(uint8_t age, Gender gender, double multiplier) const {
    double base_qx = get_qx(age, gender);
    double adjusted = base_qx * multiplier;
    // Cap at 1.0 (can't have >100% probability of death)
    return std::min(adjusted, 1.0);
}

MortalityTable MortalityTable::load_from_csv(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        throw std::runtime_error("Cannot open mortality file: " + filepath);
    }
    return load_from_csv(file);
}

MortalityTable MortalityTable::load_from_csv(std::istream& is) {
    MortalityTable table;
    CsvReader reader(is);

    // Skip header row
    if (reader.has_more()) {
        reader.read_row();
    }

    while (reader.has_more()) {
        auto row = reader.read_row();
        if (row.empty()) continue;

        if (row.size() < 3) {
            throw std::runtime_error("Mortality CSV requires columns: age,male_qx,female_qx");
        }

        uint8_t age = static_cast<uint8_t>(std::stoi(row[0]));
        double male_qx = std::stod(row[1]);
        double female_qx = std::stod(row[2]);

        table.set_qx(age, Gender::Male, male_qx);
        table.set_qx(age, Gender::Female, female_qx);
    }

    return table;
}

void MortalityTable::serialize(std::ostream& os) const {
    // Write rates in a fixed order: all male rates then all female rates
    for (size_t g = 0; g < NUM_GENDERS; ++g) {
        for (size_t a = 0; a < NUM_AGES; ++a) {
            double rate = rates_[g][a];
            os.write(reinterpret_cast<const char*>(&rate), sizeof(rate));
        }
    }
}

MortalityTable MortalityTable::deserialize(std::istream& is) {
    MortalityTable table;
    for (size_t g = 0; g < NUM_GENDERS; ++g) {
        for (size_t a = 0; a < NUM_AGES; ++a) {
            double rate;
            is.read(reinterpret_cast<char*>(&rate), sizeof(rate));
            table.rates_[g][a] = rate;
        }
    }
    return table;
}

// ============================================================================
// LapseTable Implementation
// ============================================================================

LapseTable::LapseTable() {
    rates_.fill(0.0);
}

void LapseTable::set_rate(uint8_t year, double rate) {
    if (year < 1 || year > MAX_YEAR) {
        throw std::out_of_range("Year " + std::to_string(year) + " must be between 1 and " + std::to_string(MAX_YEAR));
    }
    if (rate < 0.0 || rate > 1.0) {
        throw std::invalid_argument("Lapse rate must be between 0.0 and 1.0");
    }
    rates_[year - 1] = rate;
}

double LapseTable::get_rate(uint8_t year) const {
    if (year < 1 || year > MAX_YEAR) {
        throw std::out_of_range("Year " + std::to_string(year) + " must be between 1 and " + std::to_string(MAX_YEAR));
    }
    return rates_[year - 1];
}

double LapseTable::get_rate(uint8_t year, double multiplier) const {
    double base_rate = get_rate(year);
    double adjusted = base_rate * multiplier;
    // Cap at 1.0
    return std::min(adjusted, 1.0);
}

LapseTable LapseTable::load_from_csv(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        throw std::runtime_error("Cannot open lapse file: " + filepath);
    }
    return load_from_csv(file);
}

LapseTable LapseTable::load_from_csv(std::istream& is) {
    LapseTable table;
    CsvReader reader(is);

    // Skip header row
    if (reader.has_more()) {
        reader.read_row();
    }

    while (reader.has_more()) {
        auto row = reader.read_row();
        if (row.empty()) continue;

        if (row.size() < 2) {
            throw std::runtime_error("Lapse CSV requires columns: year,lapse_rate");
        }

        uint8_t year = static_cast<uint8_t>(std::stoi(row[0]));
        double lapse_rate = std::stod(row[1]);

        table.set_rate(year, lapse_rate);
    }

    return table;
}

void LapseTable::serialize(std::ostream& os) const {
    for (size_t y = 0; y < NUM_YEARS; ++y) {
        double rate = rates_[y];
        os.write(reinterpret_cast<const char*>(&rate), sizeof(rate));
    }
}

LapseTable LapseTable::deserialize(std::istream& is) {
    LapseTable table;
    for (size_t y = 0; y < NUM_YEARS; ++y) {
        double rate;
        is.read(reinterpret_cast<char*>(&rate), sizeof(rate));
        table.rates_[y] = rate;
    }
    return table;
}

// ============================================================================
// ExpenseAssumptions Implementation
// ============================================================================

ExpenseAssumptions::ExpenseAssumptions()
    : per_policy_acquisition(0.0)
    , per_policy_maintenance(0.0)
    , percent_of_premium(0.0)
    , claim_expense(0.0) {
}

ExpenseAssumptions::ExpenseAssumptions(double acq, double maint, double pct, double claim)
    : per_policy_acquisition(acq)
    , per_policy_maintenance(maint)
    , percent_of_premium(pct)
    , claim_expense(claim) {
}

bool ExpenseAssumptions::operator==(const ExpenseAssumptions& other) const {
    return per_policy_acquisition == other.per_policy_acquisition &&
           per_policy_maintenance == other.per_policy_maintenance &&
           percent_of_premium == other.percent_of_premium &&
           claim_expense == other.claim_expense;
}

double ExpenseAssumptions::first_year_expense(double premium) const {
    return per_policy_acquisition + per_policy_maintenance + (percent_of_premium * premium);
}

double ExpenseAssumptions::renewal_expense(double premium) const {
    return per_policy_maintenance + (percent_of_premium * premium);
}

double ExpenseAssumptions::first_year_expense(double premium, double multiplier) const {
    return first_year_expense(premium) * multiplier;
}

double ExpenseAssumptions::renewal_expense(double premium, double multiplier) const {
    return renewal_expense(premium) * multiplier;
}

ExpenseAssumptions ExpenseAssumptions::load_from_csv(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        throw std::runtime_error("Cannot open expenses file: " + filepath);
    }
    return load_from_csv(file);
}

ExpenseAssumptions ExpenseAssumptions::load_from_csv(std::istream& is) {
    ExpenseAssumptions expenses;
    CsvReader reader(is);

    // Skip header row
    if (reader.has_more()) {
        reader.read_row();
    }

    // Expect format: name,value pairs
    // per_policy_acquisition,500
    // per_policy_maintenance,50
    // percent_of_premium,0.05
    // claim_expense,100
    while (reader.has_more()) {
        auto row = reader.read_row();
        if (row.empty()) continue;

        if (row.size() < 2) {
            throw std::runtime_error("Expenses CSV requires columns: name,value");
        }

        std::string name = row[0];
        double value = std::stod(row[1]);

        // Convert to lowercase for comparison
        std::transform(name.begin(), name.end(), name.begin(), ::tolower);

        if (name == "per_policy_acquisition" || name == "acquisition") {
            expenses.per_policy_acquisition = value;
        } else if (name == "per_policy_maintenance" || name == "maintenance") {
            expenses.per_policy_maintenance = value;
        } else if (name == "percent_of_premium" || name == "premium_percent") {
            expenses.percent_of_premium = value;
        } else if (name == "claim_expense" || name == "claim") {
            expenses.claim_expense = value;
        }
    }

    return expenses;
}

void ExpenseAssumptions::serialize(std::ostream& os) const {
    os.write(reinterpret_cast<const char*>(&per_policy_acquisition), sizeof(per_policy_acquisition));
    os.write(reinterpret_cast<const char*>(&per_policy_maintenance), sizeof(per_policy_maintenance));
    os.write(reinterpret_cast<const char*>(&percent_of_premium), sizeof(percent_of_premium));
    os.write(reinterpret_cast<const char*>(&claim_expense), sizeof(claim_expense));
}

ExpenseAssumptions ExpenseAssumptions::deserialize(std::istream& is) {
    ExpenseAssumptions expenses;
    is.read(reinterpret_cast<char*>(&expenses.per_policy_acquisition), sizeof(expenses.per_policy_acquisition));
    is.read(reinterpret_cast<char*>(&expenses.per_policy_maintenance), sizeof(expenses.per_policy_maintenance));
    is.read(reinterpret_cast<char*>(&expenses.percent_of_premium), sizeof(expenses.percent_of_premium));
    is.read(reinterpret_cast<char*>(&expenses.claim_expense), sizeof(expenses.claim_expense));
    return expenses;
}

} // namespace livecalc
