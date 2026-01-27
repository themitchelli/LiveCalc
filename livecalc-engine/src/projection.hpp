#ifndef LIVECALC_PROJECTION_HPP
#define LIVECALC_PROJECTION_HPP

#include "policy.hpp"
#include "assumptions.hpp"
#include "scenario.hpp"
#include <vector>

namespace livecalc {

// Forward declaration for UDF support
struct UDFContext;

// Detailed cash flow for a single year
struct YearlyCashFlow {
    uint8_t year;                   // Policy year (1-based)
    double lives_boy;               // Lives in-force at beginning of year
    double premium_income;          // Premium received
    double death_benefit;           // Death benefits paid
    double surrender_benefit;       // Surrender benefits paid
    double expenses;                // Total expenses
    double net_cashflow;            // Net of all cash flows (company perspective)
    double discount_factor;         // Cumulative discount factor to year 0
    double discounted_cashflow;     // Net cashflow × discount factor
};

// Result of projecting a single policy under a single scenario
struct ProjectionResult {
    double npv;                     // Net present value of all cash flows
    std::vector<YearlyCashFlow> cashflows;  // Detailed cash flows by year

    // UDF execution metrics
    int udfs_called;                // Number of UDF calls made
    double udf_time_ms;             // Total time spent in UDF execution (milliseconds)

    // Convenience constructor for NPV-only result
    explicit ProjectionResult(double npv_value);

    // Full constructor
    ProjectionResult(double npv_value, std::vector<YearlyCashFlow>&& flows);

    // Constructor with UDF metrics
    ProjectionResult(double npv_value, std::vector<YearlyCashFlow>&& flows, int udfs, double udf_ms);

    // Default constructor
    ProjectionResult();
};

// Configuration options for projection
struct ProjectionConfig {
    bool detailed_cashflows;        // If true, populate cashflows vector
    double mortality_multiplier;    // Multiplier for mortality rates (default 1.0)
    double lapse_multiplier;        // Multiplier for lapse rates (default 1.0)
    double expense_multiplier;      // Multiplier for expenses (default 1.0)

    ProjectionConfig();
};

// Project a single policy under a single scenario
// Returns NPV and optionally detailed cash flows
//
// The projection logic:
// - Start with 1.0 lives at beginning of year 1
// - Each year:
//   1. Collect premium (lives_boy × premium)
//   2. Apply death decrement (lives_boy × qx × sum_assured = death benefit)
//   3. Apply lapse decrement on survivors ((lives_boy - deaths) × lapse_rate × surrender_value)
//   4. Deduct expenses
//   5. Discount net cash flow to present value
// - Lives at end of year = lives_boy × (1 - qx) × (1 - lapse_rate)
// - Stop at end of policy term
//
// Sign convention: positive = cash inflow to company, negative = cash outflow
ProjectionResult project_policy(
    const Policy& policy,
    const MortalityTable& mortality,
    const LapseTable& lapse,
    const ExpenseAssumptions& expenses,
    const Scenario& scenario,
    const ProjectionConfig& config = ProjectionConfig()
);

// Project a single policy with UDF support
// UDF hooks available:
// - adjust_mortality(policy, year, lives, interest_rate) -> multiplier
// - adjust_lapse(policy, year, lives, interest_rate) -> multiplier
ProjectionResult project_policy_with_udf(
    const Policy& policy,
    const MortalityTable& mortality,
    const LapseTable& lapse,
    const ExpenseAssumptions& expenses,
    const Scenario& scenario,
    UDFContext& udf_context,
    const ProjectionConfig& config = ProjectionConfig()
);

} // namespace livecalc

#endif // LIVECALC_PROJECTION_HPP
