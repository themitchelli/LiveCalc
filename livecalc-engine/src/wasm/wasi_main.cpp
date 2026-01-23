/**
 * WASI-compatible main entry point for Wasmtime CLI execution.
 *
 * This file provides a standalone CLI that reads input files and writes
 * output to stdout/file, compatible with WASI runtimes like Wasmtime.
 *
 * Usage:
 *   wasmtime run livecalc-wasi.wasm -- \
 *       --policies policies.csv \
 *       --mortality mortality.csv \
 *       --lapse lapse.csv \
 *       --expenses expenses.csv \
 *       --scenarios 1000 \
 *       --seed 42 \
 *       --output results.json
 */

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>

#include "policy.hpp"
#include "assumptions.hpp"
#include "scenario.hpp"
#include "valuation.hpp"
#include "io/json_writer.hpp"

namespace {

struct Config {
    std::string policies_path;
    std::string mortality_path;
    std::string lapse_path;
    std::string expenses_path;
    std::string output_path;
    uint32_t scenarios = 1000;
    uint64_t seed = 42;
    double initial_rate = 0.04;
    double drift = 0.0;
    double volatility = 0.015;
    double min_rate = 0.0;
    double max_rate = 0.20;
    double mortality_mult = 1.0;
    double lapse_mult = 1.0;
    double expense_mult = 1.0;
    bool help = false;
};

void print_usage(const char* program_name) {
    fprintf(stderr, "Usage: %s [options]\n\n", program_name);
    fprintf(stderr, "Required options:\n");
    fprintf(stderr, "  --policies <path>     CSV file with policy data\n");
    fprintf(stderr, "  --mortality <path>    CSV file with mortality table\n");
    fprintf(stderr, "  --lapse <path>        CSV file with lapse rates\n");
    fprintf(stderr, "  --expenses <path>     CSV file with expense assumptions\n\n");
    fprintf(stderr, "Scenario options:\n");
    fprintf(stderr, "  --scenarios <count>   Number of scenarios (default: 1000)\n");
    fprintf(stderr, "  --seed <value>        Random seed (default: 42)\n");
    fprintf(stderr, "  --initial-rate <r>    Initial interest rate (default: 0.04)\n");
    fprintf(stderr, "  --drift <d>           Annual drift (default: 0.0)\n");
    fprintf(stderr, "  --volatility <v>      Annual volatility (default: 0.015)\n");
    fprintf(stderr, "  --min-rate <r>        Minimum interest rate (default: 0.0)\n");
    fprintf(stderr, "  --max-rate <r>        Maximum interest rate (default: 0.20)\n\n");
    fprintf(stderr, "Stress testing:\n");
    fprintf(stderr, "  --mortality-mult <m>  Mortality multiplier (default: 1.0)\n");
    fprintf(stderr, "  --lapse-mult <m>      Lapse multiplier (default: 1.0)\n");
    fprintf(stderr, "  --expense-mult <m>    Expense multiplier (default: 1.0)\n\n");
    fprintf(stderr, "Output:\n");
    fprintf(stderr, "  --output <path>       Output JSON file (default: stdout)\n");
    fprintf(stderr, "  --help                Show this help message\n");
}

bool parse_args(int argc, char* argv[], Config& config) {
    for (int i = 1; i < argc; ++i) {
        const char* arg = argv[i];

        if (strcmp(arg, "--help") == 0 || strcmp(arg, "-h") == 0) {
            config.help = true;
            return true;
        }

        // All other options require a value
        if (i + 1 >= argc) {
            fprintf(stderr, "Error: %s requires a value\n", arg);
            return false;
        }
        const char* value = argv[++i];

        if (strcmp(arg, "--policies") == 0) {
            config.policies_path = value;
        } else if (strcmp(arg, "--mortality") == 0) {
            config.mortality_path = value;
        } else if (strcmp(arg, "--lapse") == 0) {
            config.lapse_path = value;
        } else if (strcmp(arg, "--expenses") == 0) {
            config.expenses_path = value;
        } else if (strcmp(arg, "--output") == 0) {
            config.output_path = value;
        } else if (strcmp(arg, "--scenarios") == 0) {
            config.scenarios = static_cast<uint32_t>(atoi(value));
        } else if (strcmp(arg, "--seed") == 0) {
            config.seed = static_cast<uint64_t>(atoll(value));
        } else if (strcmp(arg, "--initial-rate") == 0) {
            config.initial_rate = atof(value);
        } else if (strcmp(arg, "--drift") == 0) {
            config.drift = atof(value);
        } else if (strcmp(arg, "--volatility") == 0) {
            config.volatility = atof(value);
        } else if (strcmp(arg, "--min-rate") == 0) {
            config.min_rate = atof(value);
        } else if (strcmp(arg, "--max-rate") == 0) {
            config.max_rate = atof(value);
        } else if (strcmp(arg, "--mortality-mult") == 0) {
            config.mortality_mult = atof(value);
        } else if (strcmp(arg, "--lapse-mult") == 0) {
            config.lapse_mult = atof(value);
        } else if (strcmp(arg, "--expense-mult") == 0) {
            config.expense_mult = atof(value);
        } else {
            fprintf(stderr, "Error: Unknown option %s\n", arg);
            return false;
        }
    }
    return true;
}

bool validate_config(const Config& config) {
    if (config.policies_path.empty()) {
        fprintf(stderr, "Error: --policies is required\n");
        return false;
    }
    if (config.mortality_path.empty()) {
        fprintf(stderr, "Error: --mortality is required\n");
        return false;
    }
    if (config.lapse_path.empty()) {
        fprintf(stderr, "Error: --lapse is required\n");
        return false;
    }
    if (config.expenses_path.empty()) {
        fprintf(stderr, "Error: --expenses is required\n");
        return false;
    }
    if (config.scenarios == 0) {
        fprintf(stderr, "Error: --scenarios must be positive\n");
        return false;
    }
    return true;
}

std::string read_file(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        throw std::runtime_error("Cannot open file: " + path);
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

} // namespace

int main(int argc, char* argv[]) {
    Config config;

    if (!parse_args(argc, argv, config)) {
        print_usage(argv[0]);
        return 1;
    }

    if (config.help) {
        print_usage(argv[0]);
        return 0;
    }

    if (!validate_config(config)) {
        print_usage(argv[0]);
        return 1;
    }

    try {
        // Load data from files
        fprintf(stderr, "Loading policies from %s...\n", config.policies_path.c_str());
        livecalc::PolicySet policies = livecalc::PolicySet::load_from_csv(config.policies_path);
        fprintf(stderr, "Loaded %zu policies\n", policies.size());

        fprintf(stderr, "Loading mortality from %s...\n", config.mortality_path.c_str());
        livecalc::MortalityTable mortality = livecalc::MortalityTable::load_from_csv(config.mortality_path);

        fprintf(stderr, "Loading lapse from %s...\n", config.lapse_path.c_str());
        livecalc::LapseTable lapse = livecalc::LapseTable::load_from_csv(config.lapse_path);

        fprintf(stderr, "Loading expenses from %s...\n", config.expenses_path.c_str());
        livecalc::ExpenseAssumptions expenses = livecalc::ExpenseAssumptions::load_from_csv(config.expenses_path);

        // Generate scenarios
        fprintf(stderr, "Generating %u scenarios (seed=%lu)...\n", config.scenarios, config.seed);
        livecalc::ScenarioGeneratorParams params(
            config.initial_rate,
            config.drift,
            config.volatility,
            config.min_rate,
            config.max_rate
        );
        livecalc::ScenarioSet scenarios = livecalc::ScenarioSet::generate(config.scenarios, params, config.seed);

        // Configure valuation
        livecalc::ValuationConfig val_config;
        val_config.mortality_multiplier = config.mortality_mult;
        val_config.lapse_multiplier = config.lapse_mult;
        val_config.expense_multiplier = config.expense_mult;
        val_config.store_scenario_npvs = true;

        // Run valuation
        fprintf(stderr, "Running valuation...\n");
        livecalc::ValuationResult result = livecalc::run_valuation(
            policies, mortality, lapse, expenses, scenarios, val_config
        );

        fprintf(stderr, "Valuation complete in %.2f ms\n", result.execution_time_ms);

        // Generate JSON output
        std::string json = livecalc::json::write_valuation_result(result);

        // Write output
        if (config.output_path.empty()) {
            printf("%s\n", json.c_str());
        } else {
            std::ofstream out(config.output_path);
            if (!out.is_open()) {
                fprintf(stderr, "Error: Cannot write to %s\n", config.output_path.c_str());
                return 1;
            }
            out << json << std::endl;
            fprintf(stderr, "Results written to %s\n", config.output_path.c_str());
        }

        return 0;

    } catch (const std::exception& e) {
        fprintf(stderr, "Error: %s\n", e.what());
        return 1;
    }
}
