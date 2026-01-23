// WASM exports for LiveCalc Engine
// These functions provide a C-compatible interface for JavaScript interop

#include <cstdint>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>

#include "../policy.hpp"
#include "../assumptions.hpp"
#include "../scenario.hpp"
#include "../valuation.hpp"

using namespace livecalc;

// Global state for WASM module
// These persist across function calls to avoid repeated allocations
static PolicySet g_policies;
static MortalityTable g_mortality;
static LapseTable g_lapse;
static ExpenseAssumptions g_expenses;
static ValuationResult g_result;

// Result buffer for JSON output
static std::string g_result_json;

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define WASM_EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define WASM_EXPORT extern "C"
#endif

// ============================================================================
// Memory Management
// ============================================================================

// These are already exported by Emscripten, but we provide wrappers
// for explicit control and potential future customization

WASM_EXPORT
void* livecalc_malloc(size_t size) {
    return malloc(size);
}

WASM_EXPORT
void livecalc_free(void* ptr) {
    free(ptr);
}

// ============================================================================
// Policy Loading
// ============================================================================

// Load policies from binary data in WASM memory
// Binary format: 4-byte count, then N × 24 bytes of policy data
// Returns: number of policies loaded, or -1 on error
WASM_EXPORT
int32_t load_policies_binary(const uint8_t* data, size_t size) {
    if (!data || size < sizeof(uint32_t)) {
        return -1;
    }

    try {
        std::string buffer(reinterpret_cast<const char*>(data), size);
        std::istringstream iss(buffer, std::ios::binary);
        g_policies = PolicySet::deserialize(iss);
        return static_cast<int32_t>(g_policies.size());
    } catch (...) {
        return -1;
    }
}

// Load policies from CSV string data
// Returns: number of policies loaded, or -1 on error
WASM_EXPORT
int32_t load_policies_csv(const char* csv_data, size_t size) {
    if (!csv_data || size == 0) {
        return -1;
    }

    try {
        std::string buffer(csv_data, size);
        std::istringstream iss(buffer);
        g_policies = PolicySet::load_from_csv(iss);
        return static_cast<int32_t>(g_policies.size());
    } catch (...) {
        return -1;
    }
}

// Get number of loaded policies
WASM_EXPORT
int32_t get_policy_count() {
    return static_cast<int32_t>(g_policies.size());
}

// Clear loaded policies (free memory)
WASM_EXPORT
void clear_policies() {
    g_policies.clear();
}

// ============================================================================
// Assumption Loading
// ============================================================================

// Load mortality table from binary data
// Returns: 0 on success, -1 on error
WASM_EXPORT
int32_t load_mortality_binary(const uint8_t* data, size_t size) {
    if (!data || size < MortalityTable::serialized_size()) {
        return -1;
    }

    try {
        std::string buffer(reinterpret_cast<const char*>(data), size);
        std::istringstream iss(buffer, std::ios::binary);
        g_mortality = MortalityTable::deserialize(iss);
        return 0;
    } catch (...) {
        return -1;
    }
}

// Load mortality table from CSV string
// Returns: 0 on success, -1 on error
WASM_EXPORT
int32_t load_mortality_csv(const char* csv_data, size_t size) {
    if (!csv_data || size == 0) {
        return -1;
    }

    try {
        std::string buffer(csv_data, size);
        std::istringstream iss(buffer);
        g_mortality = MortalityTable::load_from_csv(iss);
        return 0;
    } catch (...) {
        return -1;
    }
}

// Load lapse table from binary data
// Returns: 0 on success, -1 on error
WASM_EXPORT
int32_t load_lapse_binary(const uint8_t* data, size_t size) {
    if (!data || size < LapseTable::serialized_size()) {
        return -1;
    }

    try {
        std::string buffer(reinterpret_cast<const char*>(data), size);
        std::istringstream iss(buffer, std::ios::binary);
        g_lapse = LapseTable::deserialize(iss);
        return 0;
    } catch (...) {
        return -1;
    }
}

// Load lapse table from CSV string
// Returns: 0 on success, -1 on error
WASM_EXPORT
int32_t load_lapse_csv(const char* csv_data, size_t size) {
    if (!csv_data || size == 0) {
        return -1;
    }

    try {
        std::string buffer(csv_data, size);
        std::istringstream iss(buffer);
        g_lapse = LapseTable::load_from_csv(iss);
        return 0;
    } catch (...) {
        return -1;
    }
}

// Load expense assumptions from binary data
// Returns: 0 on success, -1 on error
WASM_EXPORT
int32_t load_expenses_binary(const uint8_t* data, size_t size) {
    if (!data || size < ExpenseAssumptions::serialized_size()) {
        return -1;
    }

    try {
        std::string buffer(reinterpret_cast<const char*>(data), size);
        std::istringstream iss(buffer, std::ios::binary);
        g_expenses = ExpenseAssumptions::deserialize(iss);
        return 0;
    } catch (...) {
        return -1;
    }
}

// Load expense assumptions from CSV string
// Returns: 0 on success, -1 on error
WASM_EXPORT
int32_t load_expenses_csv(const char* csv_data, size_t size) {
    if (!csv_data || size == 0) {
        return -1;
    }

    try {
        std::string buffer(csv_data, size);
        std::istringstream iss(buffer);
        g_expenses = ExpenseAssumptions::load_from_csv(iss);
        return 0;
    } catch (...) {
        return -1;
    }
}

// ============================================================================
// Valuation Execution
// ============================================================================

// Run nested stochastic valuation with generated scenarios
// Parameters:
//   num_scenarios: number of scenarios to generate
//   seed: random seed for reproducibility
//   initial_rate: starting interest rate (e.g., 0.04 for 4%)
//   drift: annual drift
//   volatility: annual volatility
//   min_rate: floor for rates
//   max_rate: ceiling for rates
//   mortality_mult: mortality rate multiplier (1.0 = no change)
//   lapse_mult: lapse rate multiplier
//   expense_mult: expense multiplier
//   store_distribution: if true, store individual scenario NPVs
// Returns: 0 on success, -1 on error
WASM_EXPORT
int32_t run_valuation(
    int32_t num_scenarios,
    uint64_t seed,
    double initial_rate,
    double drift,
    double volatility,
    double min_rate,
    double max_rate,
    double mortality_mult,
    double lapse_mult,
    double expense_mult,
    int32_t store_distribution
) {
    if (num_scenarios <= 0 || g_policies.empty()) {
        return -1;
    }

    try {
        // Generate scenarios
        ScenarioGeneratorParams params(initial_rate, drift, volatility, min_rate, max_rate);
        ScenarioSet scenarios = ScenarioSet::generate(
            static_cast<size_t>(num_scenarios), params, seed);

        // Configure valuation
        ValuationConfig config;
        config.store_scenario_npvs = (store_distribution != 0);
        config.mortality_multiplier = mortality_mult;
        config.lapse_multiplier = lapse_mult;
        config.expense_multiplier = expense_mult;

        // Run valuation
        g_result = livecalc::run_valuation(
            g_policies, g_mortality, g_lapse, g_expenses, scenarios, config);

        return 0;
    } catch (...) {
        return -1;
    }
}

// ============================================================================
// Result Access
// ============================================================================

WASM_EXPORT
double get_result_mean() {
    return g_result.mean_npv;
}

WASM_EXPORT
double get_result_std_dev() {
    return g_result.std_dev;
}

WASM_EXPORT
double get_result_p50() {
    return g_result.p50();
}

WASM_EXPORT
double get_result_p75() {
    return g_result.p75();
}

WASM_EXPORT
double get_result_p90() {
    return g_result.p90();
}

WASM_EXPORT
double get_result_p95() {
    return g_result.p95();
}

WASM_EXPORT
double get_result_p99() {
    return g_result.p99();
}

WASM_EXPORT
double get_result_cte95() {
    return g_result.cte_95;
}

WASM_EXPORT
double get_result_execution_time_ms() {
    return g_result.execution_time_ms;
}

WASM_EXPORT
int32_t get_result_scenario_count() {
    return static_cast<int32_t>(g_result.scenario_npvs.size());
}

// Get scenario NPV at index (for distribution charting)
// Returns NaN if index out of range or distribution not stored
WASM_EXPORT
double get_result_scenario_npv(int32_t index) {
    if (index < 0 || static_cast<size_t>(index) >= g_result.scenario_npvs.size()) {
        return std::nan("");
    }
    return g_result.scenario_npvs[static_cast<size_t>(index)];
}

// Copy all scenario NPVs to provided buffer
// Returns: number of values copied, or -1 if buffer too small
WASM_EXPORT
int32_t get_result_distribution(double* buffer, int32_t buffer_size) {
    if (!buffer || buffer_size < static_cast<int32_t>(g_result.scenario_npvs.size())) {
        return -1;
    }

    std::memcpy(buffer, g_result.scenario_npvs.data(),
                g_result.scenario_npvs.size() * sizeof(double));
    return static_cast<int32_t>(g_result.scenario_npvs.size());
}

// ============================================================================
// JSON Output (convenient for JS interop)
// ============================================================================

// Generate JSON result string (stores internally)
// Returns: length of JSON string, or -1 on error
WASM_EXPORT
int32_t generate_result_json() {
    try {
        std::ostringstream oss;
        oss << "{\n";
        oss << "  \"statistics\": {\n";
        oss << "    \"mean_npv\": " << g_result.mean_npv << ",\n";
        oss << "    \"std_dev\": " << g_result.std_dev << ",\n";
        oss << "    \"percentiles\": {\n";
        oss << "      \"p50\": " << g_result.p50() << ",\n";
        oss << "      \"p75\": " << g_result.p75() << ",\n";
        oss << "      \"p90\": " << g_result.p90() << ",\n";
        oss << "      \"p95\": " << g_result.p95() << ",\n";
        oss << "      \"p99\": " << g_result.p99() << "\n";
        oss << "    },\n";
        oss << "    \"cte_95\": " << g_result.cte_95 << "\n";
        oss << "  },\n";
        oss << "  \"execution_time_ms\": " << g_result.execution_time_ms << ",\n";
        oss << "  \"scenario_count\": " << g_result.scenario_npvs.size();

        if (!g_result.scenario_npvs.empty()) {
            oss << ",\n  \"distribution\": [";
            for (size_t i = 0; i < g_result.scenario_npvs.size(); ++i) {
                if (i > 0) oss << ",";
                if (i % 10 == 0) oss << "\n    ";
                oss << g_result.scenario_npvs[i];
            }
            oss << "\n  ]";
        }

        oss << "\n}";
        g_result_json = oss.str();
        return static_cast<int32_t>(g_result_json.size());
    } catch (...) {
        return -1;
    }
}

// Get pointer to JSON result string
WASM_EXPORT
const char* get_result_json_ptr() {
    return g_result_json.c_str();
}

// Get length of JSON result string
WASM_EXPORT
int32_t get_result_json_length() {
    return static_cast<int32_t>(g_result_json.size());
}

// ============================================================================
// Version and Info
// ============================================================================

static const char* VERSION_STRING = "1.0.0";

WASM_EXPORT
const char* get_version() {
    return VERSION_STRING;
}
