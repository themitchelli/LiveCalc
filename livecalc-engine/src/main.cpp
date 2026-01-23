#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <sstream>
#include <cstdlib>
#include "policy.hpp"
#include "assumptions.hpp"
#include "scenario.hpp"
#include "valuation.hpp"
#include "io/json_writer.hpp"

namespace {

struct CLIArgs {
    std::string policies_path;
    std::string mortality_path;
    std::string lapse_path;
    std::string expenses_path;
    size_t num_scenarios = 1000;
    uint64_t seed = 42;
    std::string output_path;
    bool help = false;
    // Optional scenario generation parameters
    double initial_rate = 0.04;
    double drift = 0.0;
    double volatility = 0.015;
    double min_rate = 0.0;
    double max_rate = 0.20;
    // Optional multipliers
    double mortality_multiplier = 1.0;
    double lapse_multiplier = 1.0;
    double expense_multiplier = 1.0;
};

void print_usage(const char* program_name) {
    std::cerr << "LiveCalc Engine v1.0.0\n\n";
    std::cerr << "Usage: " << program_name << " [options]\n\n";
    std::cerr << "Required options:\n";
    std::cerr << "  --policies <path>      CSV file containing policy data\n";
    std::cerr << "  --mortality <path>     CSV file containing mortality table\n";
    std::cerr << "  --lapse <path>         CSV file containing lapse table\n";
    std::cerr << "  --expenses <path>      CSV file containing expense assumptions\n\n";
    std::cerr << "Scenario generation options:\n";
    std::cerr << "  --scenarios <count>    Number of scenarios to generate (default: 1000)\n";
    std::cerr << "  --seed <value>         Random seed for reproducibility (default: 42)\n";
    std::cerr << "  --initial-rate <rate>  Initial interest rate (default: 0.04)\n";
    std::cerr << "  --drift <value>        Annual drift (default: 0.0)\n";
    std::cerr << "  --volatility <value>   Annual volatility (default: 0.015)\n";
    std::cerr << "  --min-rate <rate>      Minimum interest rate (default: 0.0)\n";
    std::cerr << "  --max-rate <rate>      Maximum interest rate (default: 0.20)\n\n";
    std::cerr << "Stress testing options:\n";
    std::cerr << "  --mortality-mult <m>   Mortality multiplier (default: 1.0)\n";
    std::cerr << "  --lapse-mult <m>       Lapse multiplier (default: 1.0)\n";
    std::cerr << "  --expense-mult <m>     Expense multiplier (default: 1.0)\n\n";
    std::cerr << "Output options:\n";
    std::cerr << "  --output <path>        JSON output file (default: stdout)\n\n";
    std::cerr << "Other options:\n";
    std::cerr << "  --help                 Show this help message\n\n";
    std::cerr << "Example:\n";
    std::cerr << "  " << program_name << " --policies data/policies.csv \\\n";
    std::cerr << "      --mortality data/sample_mortality.csv \\\n";
    std::cerr << "      --lapse data/sample_lapse.csv \\\n";
    std::cerr << "      --expenses data/sample_expenses.csv \\\n";
    std::cerr << "      --scenarios 1000 --seed 42 \\\n";
    std::cerr << "      --output results.json\n";
}

bool file_exists(const std::string& path) {
    std::ifstream f(path);
    return f.good();
}

bool parse_args(int argc, char* argv[], CLIArgs& args) {
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];

        if (arg == "--help" || arg == "-h") {
            args.help = true;
            return true;
        } else if (arg == "--policies" && i + 1 < argc) {
            args.policies_path = argv[++i];
        } else if (arg == "--mortality" && i + 1 < argc) {
            args.mortality_path = argv[++i];
        } else if (arg == "--lapse" && i + 1 < argc) {
            args.lapse_path = argv[++i];
        } else if (arg == "--expenses" && i + 1 < argc) {
            args.expenses_path = argv[++i];
        } else if (arg == "--scenarios" && i + 1 < argc) {
            args.num_scenarios = static_cast<size_t>(std::stoul(argv[++i]));
        } else if (arg == "--seed" && i + 1 < argc) {
            args.seed = std::stoull(argv[++i]);
        } else if (arg == "--output" && i + 1 < argc) {
            args.output_path = argv[++i];
        } else if (arg == "--initial-rate" && i + 1 < argc) {
            args.initial_rate = std::stod(argv[++i]);
        } else if (arg == "--drift" && i + 1 < argc) {
            args.drift = std::stod(argv[++i]);
        } else if (arg == "--volatility" && i + 1 < argc) {
            args.volatility = std::stod(argv[++i]);
        } else if (arg == "--min-rate" && i + 1 < argc) {
            args.min_rate = std::stod(argv[++i]);
        } else if (arg == "--max-rate" && i + 1 < argc) {
            args.max_rate = std::stod(argv[++i]);
        } else if (arg == "--mortality-mult" && i + 1 < argc) {
            args.mortality_multiplier = std::stod(argv[++i]);
        } else if (arg == "--lapse-mult" && i + 1 < argc) {
            args.lapse_multiplier = std::stod(argv[++i]);
        } else if (arg == "--expense-mult" && i + 1 < argc) {
            args.expense_multiplier = std::stod(argv[++i]);
        } else {
            std::cerr << "Error: Unknown option or missing argument: " << arg << "\n\n";
            return false;
        }
    }
    return true;
}

bool validate_args(const CLIArgs& args) {
    bool valid = true;

    if (args.policies_path.empty()) {
        std::cerr << "Error: --policies is required\n";
        valid = false;
    } else if (!file_exists(args.policies_path)) {
        std::cerr << "Error: Policies file not found: " << args.policies_path << "\n";
        valid = false;
    }

    if (args.mortality_path.empty()) {
        std::cerr << "Error: --mortality is required\n";
        valid = false;
    } else if (!file_exists(args.mortality_path)) {
        std::cerr << "Error: Mortality file not found: " << args.mortality_path << "\n";
        valid = false;
    }

    if (args.lapse_path.empty()) {
        std::cerr << "Error: --lapse is required\n";
        valid = false;
    } else if (!file_exists(args.lapse_path)) {
        std::cerr << "Error: Lapse file not found: " << args.lapse_path << "\n";
        valid = false;
    }

    if (args.expenses_path.empty()) {
        std::cerr << "Error: --expenses is required\n";
        valid = false;
    } else if (!file_exists(args.expenses_path)) {
        std::cerr << "Error: Expenses file not found: " << args.expenses_path << "\n";
        valid = false;
    }

    if (args.num_scenarios == 0) {
        std::cerr << "Error: --scenarios must be greater than 0\n";
        valid = false;
    }

    if (args.initial_rate < 0 || args.initial_rate > 1.0) {
        std::cerr << "Error: --initial-rate must be between 0 and 1.0\n";
        valid = false;
    }

    if (args.volatility < 0) {
        std::cerr << "Error: --volatility must be non-negative\n";
        valid = false;
    }

    if (args.min_rate > args.max_rate) {
        std::cerr << "Error: --min-rate cannot exceed --max-rate\n";
        valid = false;
    }

    if (args.mortality_multiplier <= 0) {
        std::cerr << "Error: --mortality-mult must be positive\n";
        valid = false;
    }

    if (args.lapse_multiplier <= 0) {
        std::cerr << "Error: --lapse-mult must be positive\n";
        valid = false;
    }

    if (args.expense_multiplier <= 0) {
        std::cerr << "Error: --expense-mult must be positive\n";
        valid = false;
    }

    return valid;
}

} // anonymous namespace

int main(int argc, char* argv[]) {
    CLIArgs args;

    // Parse arguments
    if (!parse_args(argc, argv, args)) {
        print_usage(argv[0]);
        return 1;
    }

    // Handle help
    if (args.help) {
        print_usage(argv[0]);
        return 0;
    }

    // If no arguments provided, show usage
    if (argc == 1) {
        print_usage(argv[0]);
        return 0;
    }

    // Validate arguments
    if (!validate_args(args)) {
        std::cerr << "\nUse --help for usage information.\n";
        return 1;
    }

    // Log configuration
    std::cerr << "LiveCalc Engine v1.0.0\n";
    std::cerr << "Configuration:\n";
    std::cerr << "  Policies:    " << args.policies_path << "\n";
    std::cerr << "  Mortality:   " << args.mortality_path << "\n";
    std::cerr << "  Lapse:       " << args.lapse_path << "\n";
    std::cerr << "  Expenses:    " << args.expenses_path << "\n";
    std::cerr << "  Scenarios:   " << args.num_scenarios << "\n";
    std::cerr << "  Seed:        " << args.seed << "\n";
    if (args.mortality_multiplier != 1.0 || args.lapse_multiplier != 1.0 ||
        args.expense_multiplier != 1.0) {
        std::cerr << "  Multipliers: mortality=" << args.mortality_multiplier
                  << " lapse=" << args.lapse_multiplier
                  << " expense=" << args.expense_multiplier << "\n";
    }
    std::cerr << "\n";

    try {
        // Load data
        std::cerr << "Loading policies..." << std::flush;
        livecalc::PolicySet policies = livecalc::PolicySet::load_from_csv(args.policies_path);
        std::cerr << " loaded " << policies.size() << " policies\n";

        std::cerr << "Loading mortality table..." << std::flush;
        livecalc::MortalityTable mortality =
            livecalc::MortalityTable::load_from_csv(args.mortality_path);
        std::cerr << " done\n";

        std::cerr << "Loading lapse table..." << std::flush;
        livecalc::LapseTable lapse = livecalc::LapseTable::load_from_csv(args.lapse_path);
        std::cerr << " done\n";

        std::cerr << "Loading expense assumptions..." << std::flush;
        livecalc::ExpenseAssumptions expenses =
            livecalc::ExpenseAssumptions::load_from_csv(args.expenses_path);
        std::cerr << " done\n";

        // Generate scenarios
        std::cerr << "Generating " << args.num_scenarios << " scenarios..." << std::flush;
        livecalc::ScenarioGeneratorParams params(
            args.initial_rate, args.drift, args.volatility, args.min_rate, args.max_rate);
        livecalc::ScenarioSet scenarios =
            livecalc::ScenarioSet::generate(args.num_scenarios, params, args.seed);
        std::cerr << " done\n";

        // Configure valuation
        livecalc::ValuationConfig config;
        config.store_scenario_npvs = true;
        config.mortality_multiplier = args.mortality_multiplier;
        config.lapse_multiplier = args.lapse_multiplier;
        config.expense_multiplier = args.expense_multiplier;

        // Run valuation
        std::cerr << "Running valuation (" << policies.size() << " policies × "
                  << scenarios.size() << " scenarios = "
                  << (policies.size() * scenarios.size()) << " projections)...\n";

        livecalc::ValuationResult result =
            livecalc::run_valuation(policies, mortality, lapse, expenses, scenarios, config);

        // Report summary to stderr
        std::cerr << "\nResults:\n";
        std::cerr << "  Mean NPV:  " << result.mean_npv << "\n";
        std::cerr << "  Std Dev:   " << result.std_dev << "\n";
        std::cerr << "  P50:       " << result.p50() << "\n";
        std::cerr << "  P75:       " << result.p75() << "\n";
        std::cerr << "  P90:       " << result.p90() << "\n";
        std::cerr << "  P95:       " << result.p95() << "\n";
        std::cerr << "  P99:       " << result.p99() << "\n";
        std::cerr << "  CTE_95:    " << result.cte_95 << "\n";
        std::cerr << "  Execution: " << result.execution_time_ms << " ms\n";

        // Write JSON output
        if (args.output_path.empty()) {
            // Write to stdout
            livecalc::io::write_valuation_result_json(std::cout, result);
        } else {
            livecalc::io::write_valuation_result_json(args.output_path, result);
            std::cerr << "\nOutput written to: " << args.output_path << "\n";
        }

        return 0;
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << "\n";
        return 1;
    }
}
