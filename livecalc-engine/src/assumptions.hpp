#ifndef LIVECALC_ASSUMPTIONS_HPP
#define LIVECALC_ASSUMPTIONS_HPP

#include <array>
#include <cstdint>
#include <istream>
#include <ostream>
#include <string>
#include "policy.hpp"

namespace livecalc {

// MortalityTable: qx rates by age (0-120) and gender
// qx = probability of death within one year for a life aged x
class MortalityTable {
public:
    static constexpr size_t MAX_AGE = 120;
    static constexpr size_t NUM_AGES = MAX_AGE + 1;  // 0 to 120 inclusive
    static constexpr size_t NUM_GENDERS = 2;

    MortalityTable();

    // Set/get mortality rate for a specific age and gender
    void set_qx(uint8_t age, Gender gender, double qx);
    double get_qx(uint8_t age, Gender gender) const;

    // Apply multiplier to get adjusted qx (e.g., 1.1x mortality)
    double get_qx(uint8_t age, Gender gender, double multiplier) const;

    // Load from CSV: expects columns age,male_qx,female_qx
    static MortalityTable load_from_csv(const std::string& filepath);
    static MortalityTable load_from_csv(std::istream& is);

    // Binary serialization for WASM
    void serialize(std::ostream& os) const;
    static MortalityTable deserialize(std::istream& is);

    static constexpr size_t serialized_size() {
        return NUM_AGES * NUM_GENDERS * sizeof(double);
    }

private:
    // rates_[gender][age] = qx
    std::array<std::array<double, NUM_AGES>, NUM_GENDERS> rates_;
};

// LapseTable: lapse rates by policy year (1-50)
// Lapse rate = probability of voluntary surrender in a given year
class LapseTable {
public:
    static constexpr size_t MAX_YEAR = 50;
    static constexpr size_t NUM_YEARS = MAX_YEAR;  // Years 1 to 50

    LapseTable();

    // Set/get lapse rate for a specific policy year (1-50)
    void set_rate(uint8_t year, double rate);
    double get_rate(uint8_t year) const;

    // Apply multiplier to get adjusted rate
    double get_rate(uint8_t year, double multiplier) const;

    // Load from CSV: expects columns year,lapse_rate
    static LapseTable load_from_csv(const std::string& filepath);
    static LapseTable load_from_csv(std::istream& is);

    // Binary serialization for WASM
    void serialize(std::ostream& os) const;
    static LapseTable deserialize(std::istream& is);

    static constexpr size_t serialized_size() {
        return NUM_YEARS * sizeof(double);
    }

private:
    // rates_[year-1] = lapse rate for that year (0-indexed internally)
    std::array<double, NUM_YEARS> rates_;
};

// ExpenseAssumptions: per-policy and percentage-of-premium expenses
struct ExpenseAssumptions {
    double per_policy_acquisition;     // One-time cost per new policy
    double per_policy_maintenance;     // Annual cost per policy in-force
    double percent_of_premium;         // Expense as % of premium (0.0-1.0)
    double claim_expense;              // Cost per claim (death/surrender)

    ExpenseAssumptions();
    ExpenseAssumptions(double acq, double maint, double pct, double claim);

    bool operator==(const ExpenseAssumptions& other) const;

    // Get total first-year expense for a policy
    double first_year_expense(double premium) const;

    // Get renewal year expense for a policy
    double renewal_expense(double premium) const;

    // Apply multipliers to get adjusted expenses
    double first_year_expense(double premium, double multiplier) const;
    double renewal_expense(double premium, double multiplier) const;

    // Load from JSON-like format or simple CSV
    static ExpenseAssumptions load_from_csv(const std::string& filepath);
    static ExpenseAssumptions load_from_csv(std::istream& is);

    // Binary serialization for WASM
    void serialize(std::ostream& os) const;
    static ExpenseAssumptions deserialize(std::istream& is);

    static constexpr size_t serialized_size() {
        return 4 * sizeof(double);
    }
};

} // namespace livecalc

#endif // LIVECALC_ASSUMPTIONS_HPP
