#include "projection.hpp"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace livecalc {

// ============================================================================
// ProjectionResult Implementation
// ============================================================================

ProjectionResult::ProjectionResult() : npv(0.0) {}

ProjectionResult::ProjectionResult(double npv_value) : npv(npv_value) {}

ProjectionResult::ProjectionResult(double npv_value, std::vector<YearlyCashFlow>&& flows)
    : npv(npv_value), cashflows(std::move(flows)) {}

// ============================================================================
// ProjectionConfig Implementation
// ============================================================================

ProjectionConfig::ProjectionConfig()
    : detailed_cashflows(false),
      mortality_multiplier(1.0),
      lapse_multiplier(1.0),
      expense_multiplier(1.0) {}

// ============================================================================
// Projection Implementation
// ============================================================================

ProjectionResult project_policy(
    const Policy& policy,
    const MortalityTable& mortality,
    const LapseTable& lapse,
    const ExpenseAssumptions& expenses,
    const Scenario& scenario,
    const ProjectionConfig& config)
{
    // Validate inputs
    if (policy.term == 0) {
        return ProjectionResult(0.0);
    }

    // Limit projection to minimum of policy term and MAX_YEAR
    const uint8_t projection_years = std::min(
        policy.term,
        static_cast<uint8_t>(std::min(LapseTable::MAX_YEAR, Scenario::MAX_YEAR))
    );

    // Initialize result
    double total_npv = 0.0;
    std::vector<YearlyCashFlow> cashflows;
    if (config.detailed_cashflows) {
        cashflows.reserve(projection_years);
    }

    // Track lives in-force (start with 1.0)
    double lives = 1.0;
    double cumulative_discount_factor = 1.0;

    for (uint8_t year = 1; year <= projection_years; ++year) {
        // Get assumptions for this year
        // Age at start of policy year = entry_age + (year - 1)
        uint8_t current_age = policy.age + (year - 1);

        // Cap age at maximum table age
        if (current_age > MortalityTable::MAX_AGE) {
            current_age = MortalityTable::MAX_AGE;
        }

        // Get rates with multipliers applied
        double qx = mortality.get_qx(current_age, policy.gender, config.mortality_multiplier);
        double lapse_rate = lapse.get_rate(year, config.lapse_multiplier);
        double interest_rate = scenario.get_rate(year);

        // Update cumulative discount factor for this year
        // Cash flows occur at end of year, so discount by this year's rate
        cumulative_discount_factor /= (1.0 + interest_rate);

        // Lives at beginning of year
        double lives_boy = lives;

        // --- Cash Flows ---

        // Premium income (received at BOY, but we model as if received at EOY for simplicity)
        // In practice, actuaries often use mid-year discounting, but EOY is simpler
        double premium_income = lives_boy * policy.premium;

        // Deaths occur during the year
        // Death benefit = probability of death × sum assured × lives
        double deaths = lives_boy * qx;
        double death_benefit = deaths * policy.sum_assured;

        // Survivors at mid-year (after deaths)
        double lives_after_deaths = lives_boy - deaths;

        // Lapses occur among survivors
        // For term products, surrender value is typically 0, but we model it anyway
        // Surrender value = 0 for term (no cash value)
        // For simplicity, assume surrender_value = 0 for all product types in this version
        double lapses = lives_after_deaths * lapse_rate;
        double surrender_value = 0.0;  // Term products have no surrender value
        double surrender_benefit = lapses * surrender_value;

        // Expenses
        double expense;
        if (year == 1) {
            expense = expenses.first_year_expense(policy.premium, config.expense_multiplier);
        } else {
            expense = expenses.renewal_expense(policy.premium, config.expense_multiplier);
        }
        expense *= lives_boy;  // Scale by lives in-force

        // Add claim expense for deaths
        double claim_expense = deaths * expenses.claim_expense * config.expense_multiplier;
        expense += claim_expense;

        // Net cash flow (from company perspective)
        // Positive = inflow to company (good)
        // Premium is income (+)
        // Death benefit is outflow (-)
        // Surrender benefit is outflow (-)
        // Expenses are outflow (-)
        double net_cashflow = premium_income - death_benefit - surrender_benefit - expense;

        // Discount to present value
        double discounted_cashflow = net_cashflow * cumulative_discount_factor;
        total_npv += discounted_cashflow;

        // Store detailed cash flow if requested
        if (config.detailed_cashflows) {
            YearlyCashFlow cf;
            cf.year = year;
            cf.lives_boy = lives_boy;
            cf.premium_income = premium_income;
            cf.death_benefit = death_benefit;
            cf.surrender_benefit = surrender_benefit;
            cf.expenses = expense;
            cf.net_cashflow = net_cashflow;
            cf.discount_factor = cumulative_discount_factor;
            cf.discounted_cashflow = discounted_cashflow;
            cashflows.push_back(cf);
        }

        // Update lives for next year
        // Lives at EOY = survivors who didn't die or lapse
        lives = lives_after_deaths - lapses;

        // If no lives remaining, stop projection
        if (lives < 1e-10) {
            break;
        }
    }

    if (config.detailed_cashflows) {
        return ProjectionResult(total_npv, std::move(cashflows));
    }
    return ProjectionResult(total_npv);
}

} // namespace livecalc
