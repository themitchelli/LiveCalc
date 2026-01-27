#include "assumption_set.hpp"
#ifdef HAVE_ASSUMPTIONS_CLIENT
#include "c++/assumptions_client.hpp"
#endif
#include <stdexcept>
#include <sstream>

namespace livecalc {

AssumptionSet::AssumptionSet()
    : mortality_(), lapse_(), expenses_(), initialized_(false) {}

void AssumptionSet::resolve_from_am(
    livecalc::assumptions::AssumptionsClient& client,
    const std::string& mortality_name,
    const std::string& mortality_version,
    const std::string& lapse_name,
    const std::string& lapse_version,
    const std::string& expense_name,
    const std::string& expense_version
) {
    try {
        // Resolve mortality table
        auto mortality_data = client.resolve(mortality_name, mortality_version);
        populate_mortality_from_vector(mortality_data);
        resolved_versions_["mortality"] = mortality_name + ":" + mortality_version;

        // Resolve lapse table
        auto lapse_data = client.resolve(lapse_name, lapse_version);
        populate_lapse_from_vector(lapse_data);
        resolved_versions_["lapse"] = lapse_name + ":" + lapse_version;

        // Resolve expense assumptions
        auto expense_data = client.resolve(expense_name, expense_version);
        populate_expense_from_vector(expense_data);
        resolved_versions_["expenses"] = expense_name + ":" + expense_version;

        initialized_ = true;
    } catch (const livecalc::assumptions::AssumptionsError& e) {
        std::ostringstream oss;
        oss << "Failed to resolve assumptions: " << e.what();
        throw std::runtime_error(oss.str());
    }
}

void AssumptionSet::load_from_files(
    const std::string& mortality_csv,
    const std::string& lapse_csv,
    const std::string& expense_csv
) {
    mortality_ = MortalityTable::load_from_csv(mortality_csv);
    resolved_versions_["mortality"] = "local:" + mortality_csv;

    lapse_ = LapseTable::load_from_csv(lapse_csv);
    resolved_versions_["lapse"] = "local:" + lapse_csv;

    expenses_ = ExpenseAssumptions::load_from_csv(expense_csv);
    resolved_versions_["expenses"] = "local:" + expense_csv;

    initialized_ = true;
}

bool AssumptionSet::is_initialized() const {
    return initialized_;
}

double AssumptionSet::get_mortality_qx(uint8_t age, Gender gender) const {
    if (!initialized_) {
        throw std::runtime_error("AssumptionSet not initialized");
    }
    return mortality_.get_qx(age, gender);
}

double AssumptionSet::get_mortality_qx(uint8_t age, Gender gender, double multiplier) const {
    if (!initialized_) {
        throw std::runtime_error("AssumptionSet not initialized");
    }
    return mortality_.get_qx(age, gender, multiplier);
}

double AssumptionSet::get_lapse_rate(uint8_t year) const {
    if (!initialized_) {
        throw std::runtime_error("AssumptionSet not initialized");
    }
    return lapse_.get_rate(year);
}

double AssumptionSet::get_lapse_rate(uint8_t year, double multiplier) const {
    if (!initialized_) {
        throw std::runtime_error("AssumptionSet not initialized");
    }
    return lapse_.get_rate(year, multiplier);
}

double AssumptionSet::get_first_year_expense(double premium) const {
    if (!initialized_) {
        throw std::runtime_error("AssumptionSet not initialized");
    }
    return expenses_.first_year_expense(premium);
}

double AssumptionSet::get_renewal_expense(double premium) const {
    if (!initialized_) {
        throw std::runtime_error("AssumptionSet not initialized");
    }
    return expenses_.renewal_expense(premium);
}

double AssumptionSet::get_first_year_expense(double premium, double multiplier) const {
    if (!initialized_) {
        throw std::runtime_error("AssumptionSet not initialized");
    }
    return expenses_.first_year_expense(premium, multiplier);
}

double AssumptionSet::get_renewal_expense(double premium, double multiplier) const {
    if (!initialized_) {
        throw std::runtime_error("AssumptionSet not initialized");
    }
    return expenses_.renewal_expense(premium, multiplier);
}

void AssumptionSet::populate_mortality_from_vector(const std::vector<double>& data) {
    // Expected format from AM: flat array of qx values
    // Row-major: [male_age_0, male_age_1, ..., male_age_120, female_age_0, ..., female_age_120]
    // Total: 121 ages × 2 genders = 242 values

    if (data.size() != MortalityTable::NUM_AGES * MortalityTable::NUM_GENDERS) {
        std::ostringstream oss;
        oss << "Invalid mortality data size: expected "
            << (MortalityTable::NUM_AGES * MortalityTable::NUM_GENDERS)
            << ", got " << data.size();
        throw std::runtime_error(oss.str());
    }

    size_t idx = 0;

    // Male rates (ages 0-120)
    for (uint8_t age = 0; age <= MortalityTable::MAX_AGE; ++age) {
        mortality_.set_qx(age, Gender::Male, data[idx++]);
    }

    // Female rates (ages 0-120)
    for (uint8_t age = 0; age <= MortalityTable::MAX_AGE; ++age) {
        mortality_.set_qx(age, Gender::Female, data[idx++]);
    }
}

void AssumptionSet::populate_lapse_from_vector(const std::vector<double>& data) {
    // Expected format: lapse rates for years 1-50
    if (data.size() != LapseTable::NUM_YEARS) {
        std::ostringstream oss;
        oss << "Invalid lapse data size: expected "
            << LapseTable::NUM_YEARS
            << ", got " << data.size();
        throw std::runtime_error(oss.str());
    }

    for (uint8_t year = 1; year <= LapseTable::MAX_YEAR; ++year) {
        lapse_.set_rate(year, data[year - 1]);
    }
}

void AssumptionSet::populate_expense_from_vector(const std::vector<double>& data) {
    // Expected format: [acquisition, maintenance, percent_of_premium, claim_expense]
    if (data.size() != 4) {
        std::ostringstream oss;
        oss << "Invalid expense data size: expected 4, got " << data.size();
        throw std::runtime_error(oss.str());
    }

    expenses_ = ExpenseAssumptions(data[0], data[1], data[2], data[3]);
}

} // namespace livecalc
