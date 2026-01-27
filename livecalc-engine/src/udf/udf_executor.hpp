#ifndef LIVECALC_UDF_EXECUTOR_HPP
#define LIVECALC_UDF_EXECUTOR_HPP

#include "../policy.hpp"
#include <string>
#include <map>
#include <stdexcept>

namespace livecalc {

// Exception thrown when UDF execution fails
class UDFExecutionError : public std::runtime_error {
public:
    explicit UDFExecutionError(const std::string& msg) : std::runtime_error(msg) {}
};

// State passed to UDF functions
struct UDFState {
    int year;                            // Current policy year (1-based)
    double lives;                        // Lives in-force at beginning of year
    double interest_rate;                // Current year's interest rate
    std::map<std::string, double> custom; // Custom state values (extensible)

    UDFState(int y, double l, double r)
        : year(y), lives(l), interest_rate(r) {}
};

// Python UDF executor using subprocess-based execution
// Launches Python interpreter, sends JSON-encoded parameters, receives result
class UDFExecutor {
public:
    // Constructor: validates Python script exists
    explicit UDFExecutor(const std::string& script_path);

    // Destructor
    ~UDFExecutor();

    // Call a UDF function by name
    // Returns: adjustment factor (typically a multiplier like 1.0, 1.2, etc.)
    // Throws: UDFExecutionError if function not found, timeout, or error
    //
    // Function signatures expected in Python script:
    // - adjust_mortality(policy: dict, year: int, lives: float, rate: float) -> float
    // - adjust_lapse(policy: dict, year: int, lives: float, rate: float) -> float
    // - on_year_start(policy: dict, year: int, lives: float) -> dict (returns custom state)
    // - apply_shock(policy: dict, year: int) -> dict (returns multipliers: {mortality: 1.1, lapse: 0.9})
    double call_udf(
        const std::string& function_name,
        const Policy& policy,
        const UDFState& state,
        int timeout_ms = 1000
    );

    // Check if a specific UDF function exists in the script
    bool has_function(const std::string& function_name) const;

private:
    std::string script_path_;
    bool script_valid_;

    // Helper: convert Policy to JSON string
    std::string policy_to_json(const Policy& policy) const;

    // Helper: convert UDFState to JSON string
    std::string state_to_json(const UDFState& state) const;

    // Helper: execute Python subprocess and get result
    double execute_python(
        const std::string& function_name,
        const std::string& policy_json,
        const std::string& state_json,
        int timeout_ms
    );
};

} // namespace livecalc

#endif // LIVECALC_UDF_EXECUTOR_HPP
