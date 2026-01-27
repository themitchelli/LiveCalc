#include "projection.hpp"
#include "udf/udf_context.hpp"
#include "udf/udf_executor.hpp"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <chrono>

namespace livecalc {

// ============================================================================
// ProjectionResult Implementation
// ============================================================================

ProjectionResult::ProjectionResult() : npv(0.0), udfs_called(0), udf_time_ms(0.0) {}

ProjectionResult::ProjectionResult(double npv_value)
    : npv(npv_value), udfs_called(0), udf_time_ms(0.0) {}

ProjectionResult::ProjectionResult(double npv_value, std::vector<YearlyCashFlow>&& flows)
    : npv(npv_value), cashflows(std::move(flows)), udfs_called(0), udf_time_ms(0.0) {}

ProjectionResult::ProjectionResult(double npv_value, std::vector<YearlyCashFlow>&& flows,
                                   int udfs, double udf_ms)
    : npv(npv_value), cashflows(std::move(flows)), udfs_called(udfs), udf_time_ms(udf_ms) {}

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

// ============================================================================
// Projection with UDF Support
// ============================================================================

ProjectionResult project_policy_with_udf(
    const Policy& policy,
    const MortalityTable& mortality,
    const LapseTable& lapse,
    const ExpenseAssumptions& expenses,
    const Scenario& scenario,
    UDFContext& udf_context,
    const ProjectionConfig& config)
{
    // Validate inputs
    if (policy.term == 0) {
        return ProjectionResult(0.0);
    }

    // If UDFs not enabled, fall back to standard projection
    if (!udf_context.enabled || !udf_context.executor) {
        return project_policy(policy, mortality, lapse, expenses, scenario, config);
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

    // UDF metrics
    int udfs_called = 0;
    double udf_time_ms = 0.0;

    for (uint8_t year = 1; year <= projection_years; ++year) {
        // Get assumptions for this year
        // Age at start of policy year = entry_age + (year - 1)
        uint8_t current_age = policy.age + (year - 1);

        // Cap age at maximum table age
        if (current_age > MortalityTable::MAX_AGE) {
            current_age = MortalityTable::MAX_AGE;
        }

        // Get base rates
        double base_qx = mortality.get_qx(current_age, policy.gender, 1.0);
        double base_lapse_rate = lapse.get_rate(year, 1.0);
        double interest_rate = scenario.get_rate(year);

        // Create UDF state
        UDFState udf_state(year, lives, interest_rate);

        // Call adjust_mortality UDF if available
        double mortality_adj = config.mortality_multiplier;
        if (udf_context.enabled && udf_context.executor && udf_context.executor->has_function("adjust_mortality")) {
            try {
                auto start = std::chrono::high_resolution_clock::now();
                mortality_adj *= udf_context.executor->call_udf(
                    "adjust_mortality", policy, udf_state, udf_context.timeout_ms);
                auto end = std::chrono::high_resolution_clock::now();

                udf_time_ms += std::chrono::duration<double, std::milli>(end - start).count();
                udfs_called++;
            } catch (const UDFExecutionError& e) {
                // UDF failed - log and continue with base multiplier
                // In production, would log to proper logging system
                // For now, just continue without UDF adjustment
            }
        }

        // Call adjust_lapse UDF if available
        double lapse_adj = config.lapse_multiplier;
        if (udf_context.enabled && udf_context.executor && udf_context.executor->has_function("adjust_lapse")) {
            try {
                auto start = std::chrono::high_resolution_clock::now();
                lapse_adj *= udf_context.executor->call_udf(
                    "adjust_lapse", policy, udf_state, udf_context.timeout_ms);
                auto end = std::chrono::high_resolution_clock::now();

                udf_time_ms += std::chrono::duration<double, std::milli>(end - start).count();
                udfs_called++;
            } catch (const UDFExecutionError& e) {
                // UDF failed - continue with base multiplier
            }
        }

        // Apply multipliers to rates
        double qx = std::min(1.0, base_qx * mortality_adj);
        double lapse_rate = std::min(1.0, base_lapse_rate * lapse_adj);

        // Update cumulative discount factor for this year
        cumulative_discount_factor /= (1.0 + interest_rate);

        // Lives at beginning of year
        double lives_boy = lives;

        // --- Cash Flows ---

        // Premium income
        double premium_income = lives_boy * policy.premium;

        // Deaths occur during the year
        double deaths = lives_boy * qx;
        double death_benefit = deaths * policy.sum_assured;

        // Survivors at mid-year (after deaths)
        double lives_after_deaths = lives_boy - deaths;

        // Lapses occur among survivors
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
        expense *= lives_boy;

        // Add claim expense for deaths
        double claim_expense = deaths * expenses.claim_expense * config.expense_multiplier;
        expense += claim_expense;

        // Net cash flow
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
        lives = lives_after_deaths - lapses;

        // If no lives remaining, stop projection
        if (lives < 1e-10) {
            break;
        }
    }

    // Update UDF context with metrics
    udf_context.udfs_called += udfs_called;
    udf_context.udf_time_ms += udf_time_ms;

    if (config.detailed_cashflows) {
        return ProjectionResult(total_npv, std::move(cashflows), udfs_called, udf_time_ms);
    }
    return ProjectionResult(total_npv, std::vector<YearlyCashFlow>(), udfs_called, udf_time_ms);
}

} // namespace livecalc
