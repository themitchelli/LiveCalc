#ifndef LIVECALC_ASSUMPTION_SET_HPP
#define LIVECALC_ASSUMPTION_SET_HPP

#include "assumptions.hpp"
#include "policy.hpp"
#include <memory>
#include <string>
#include <map>

// Forward declare AssumptionsClient to avoid header dependency
namespace livecalc {
namespace assumptions {
    class AssumptionsClient;
}
}

namespace livecalc {

/**
 * AssumptionSet holds all resolved assumptions for a projection run
 * Integrates with assumptions_client.hpp (PRD-LC-006-REFACTOR)
 */
class AssumptionSet {
public:
    /**
     * Constructor - creates an empty assumption set
     */
    AssumptionSet();

    /**
     * Initialize from Assumptions Manager using client
     * @param client AssumptionsClient instance
     * @param mortality_name Mortality table name (e.g., "mortality-standard")
     * @param mortality_version Version (e.g., "v2.1", "latest")
     * @param lapse_name Lapse table name
     * @param lapse_version Lapse version
     * @param expense_name Expense assumptions name
     * @param expense_version Expense version
     * @throws std::runtime_error if resolution fails
     */
    void resolve_from_am(
        livecalc::assumptions::AssumptionsClient& client,
        const std::string& mortality_name,
        const std::string& mortality_version,
        const std::string& lapse_name,
        const std::string& lapse_version,
        const std::string& expense_name,
        const std::string& expense_version
    );

    /**
     * Initialize from local CSV files (legacy path)
     */
    void load_from_files(
        const std::string& mortality_csv,
        const std::string& lapse_csv,
        const std::string& expense_csv
    );

    /**
     * Check if all assumptions are loaded
     */
    bool is_initialized() const;

    /**
     * Get mortality rate for age and gender
     */
    double get_mortality_qx(uint8_t age, Gender gender) const;

    /**
     * Get mortality rate with multiplier
     */
    double get_mortality_qx(uint8_t age, Gender gender, double multiplier) const;

    /**
     * Get lapse rate for policy year
     */
    double get_lapse_rate(uint8_t year) const;

    /**
     * Get lapse rate with multiplier
     */
    double get_lapse_rate(uint8_t year, double multiplier) const;

    /**
     * Get first year expense for a policy
     */
    double get_first_year_expense(double premium) const;

    /**
     * Get renewal expense for a policy
     */
    double get_renewal_expense(double premium) const;

    /**
     * Get first year expense with multiplier
     */
    double get_first_year_expense(double premium, double multiplier) const;

    /**
     * Get renewal expense with multiplier
     */
    double get_renewal_expense(double premium, double multiplier) const;

    /**
     * Get resolved assumption versions (for audit/metadata)
     */
    const std::map<std::string, std::string>& get_resolved_versions() const {
        return resolved_versions_;
    }

    /**
     * Direct access to underlying tables (for advanced use cases)
     */
    const MortalityTable& get_mortality_table() const { return mortality_; }
    const LapseTable& get_lapse_table() const { return lapse_; }
    const ExpenseAssumptions& get_expense_assumptions() const { return expenses_; }

private:
    MortalityTable mortality_;
    LapseTable lapse_;
    ExpenseAssumptions expenses_;
    bool initialized_ = false;

    // Track resolved versions for audit trail
    std::map<std::string, std::string> resolved_versions_;

    // Helper to convert flat vector to MortalityTable structure
    void populate_mortality_from_vector(const std::vector<double>& data);

    // Helper to convert flat vector to LapseTable structure
    void populate_lapse_from_vector(const std::vector<double>& data);

    // Helper to convert flat vector to ExpenseAssumptions
    void populate_expense_from_vector(const std::vector<double>& data);
};

} // namespace livecalc

#endif // LIVECALC_ASSUMPTION_SET_HPP
