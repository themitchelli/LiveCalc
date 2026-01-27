#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <sstream>
#include <cstdlib>
#include "policy.hpp"
#include "assumptions.hpp"
#include "assumption_set.hpp"
#include "scenario.hpp"
#include "valuation.hpp"
#include "projection.hpp"
#include "udf/udf_context.hpp"
#include "io/json_writer.hpp"

#ifdef HAVE_ARROW
#include "io/parquet_reader.hpp"
#endif

// Simple JSON parsing for assumptions config
#include <nlohmann/json.hpp>
using json = nlohmann::json;

namespace {

struct CLIArgs {
    std::string policies_path;
    std::string mortality_path;
    std::string lapse_path;
    std::string expenses_path;
    std::string assumptions_config_path;  // NEW: JSON config file
    std::string udfs_path;                 // NEW: Python UDF script
    std::string cache_dir;                 // NEW: Cache directory for Assumptions Manager
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
    // UDF timeout
    int udf_timeout_ms = 1000;
};

void print_usage(const char* program_name) {
    std::cerr << "LiveCalc Engine v1.0.0\n\n";
    std::cerr << "Usage: " << program_name << " [options]\n\n";
    std::cerr << "Data input options:\n";
    std::cerr << "  --policies <path>           CSV or Parquet file with policy data\n";
    std::cerr << "  --assumptions-config <path> JSON configuration file for assumptions\n";
    std::cerr << "                              (alternative to individual --mortality/--lapse/--expenses)\n\n";
    std::cerr << "Individual assumption files (alternative to --assumptions-config):\n";
    std::cerr << "  --mortality <path>          CSV file containing mortality table\n";
    std::cerr << "  --lapse <path>              CSV file containing lapse table\n";
    std::cerr << "  --expenses <path>           CSV file containing expense assumptions\n\n";
    std::cerr << "Scenario generation options:\n";
    std::cerr << "  --scenarios <count>         Number of scenarios to generate (default: 1000)\n";
    std::cerr << "  --seed <value>              Random seed for reproducibility (default: 42)\n";
    std::cerr << "  --initial-rate <rate>       Initial interest rate (default: 0.04)\n";
    std::cerr << "  --drift <value>             Annual drift (default: 0.0)\n";
    std::cerr << "  --volatility <value>        Annual volatility (default: 0.015)\n";
    std::cerr << "  --min-rate <rate>           Minimum interest rate (default: 0.0)\n";
    std::cerr << "  --max-rate <rate>           Maximum interest rate (default: 0.20)\n\n";
    std::cerr << "Python UDF options:\n";
    std::cerr << "  --udfs <path>               Python script with UDF functions\n";
    std::cerr << "  --cache-dir <path>          Cache directory for Assumptions Manager\n\n";
    std::cerr << "Stress testing options:\n";
    std::cerr << "  --mortality-mult <m>        Mortality multiplier (default: 1.0)\n";
    std::cerr << "  --lapse-mult <m>            Lapse multiplier (default: 1.0)\n";
    std::cerr << "  --expense-mult <m>          Expense multiplier (default: 1.0)\n\n";
    std::cerr << "Output options:\n";
    std::cerr << "  --output <path>             JSON output file (default: stdout)\n\n";
    std::cerr << "Other options:\n";
    std::cerr << "  --help                      Show this help message\n\n";
    std::cerr << "Examples:\n\n";
    std::cerr << "  1. Basic usage with CSV files:\n";
    std::cerr << "     " << program_name << " --policies data/policies.csv \\\n";
    std::cerr << "         --mortality data/sample_mortality.csv \\\n";
    std::cerr << "         --lapse data/sample_lapse.csv \\\n";
    std::cerr << "         --expenses data/sample_expenses.csv \\\n";
    std::cerr << "         --scenarios 1000 --seed 42 \\\n";
    std::cerr << "         --output results.json\n\n";
    std::cerr << "  2. Using assumptions config with Parquet and UDFs:\n";
    std::cerr << "     " << program_name << " --policies data/policies.parquet \\\n";
    std::cerr << "         --assumptions-config assumptions.json \\\n";
    std::cerr << "         --udfs scripts/adjustments.py \\\n";
    std::cerr << "         --cache-dir ~/.livecalc/cache \\\n";
    std::cerr << "         --output results.json\n";
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
        } else if (arg == "--assumptions-config" && i + 1 < argc) {
            args.assumptions_config_path = argv[++i];
        } else if (arg == "--udfs" && i + 1 < argc) {
            args.udfs_path = argv[++i];
        } else if (arg == "--cache-dir" && i + 1 < argc) {
            args.cache_dir = argv[++i];
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

    // Policies are required
    if (args.policies_path.empty()) {
        std::cerr << "Error: --policies is required\n";
        valid = false;
    } else if (!file_exists(args.policies_path)) {
        std::cerr << "Error: Policies file not found: " << args.policies_path << "\n";
        valid = false;
    }

    // Either assumptions config OR individual assumption files required
    bool has_config = !args.assumptions_config_path.empty();
    bool has_individual_files = !args.mortality_path.empty() || !args.lapse_path.empty() || !args.expenses_path.empty();

    if (!has_config && !has_individual_files) {
        std::cerr << "Error: Must provide either --assumptions-config OR (--mortality, --lapse, --expenses)\n";
        valid = false;
    } else if (has_config && has_individual_files) {
        std::cerr << "Warning: Both --assumptions-config and individual files provided. Using config file.\n";
    }

    // Validate config file if provided
    if (has_config && !file_exists(args.assumptions_config_path)) {
        std::cerr << "Error: Assumptions config file not found: " << args.assumptions_config_path << "\n";
        valid = false;
    }

    // Validate individual files if provided and no config
    if (!has_config) {
        if (args.mortality_path.empty()) {
            std::cerr << "Error: --mortality is required (or use --assumptions-config)\n";
            valid = false;
        } else if (!file_exists(args.mortality_path)) {
            std::cerr << "Error: Mortality file not found: " << args.mortality_path << "\n";
            valid = false;
        }

        if (args.lapse_path.empty()) {
            std::cerr << "Error: --lapse is required (or use --assumptions-config)\n";
            valid = false;
        } else if (!file_exists(args.lapse_path)) {
            std::cerr << "Error: Lapse file not found: " << args.lapse_path << "\n";
            valid = false;
        }

        if (args.expenses_path.empty()) {
            std::cerr << "Error: --expenses is required (or use --assumptions-config)\n";
            valid = false;
        } else if (!file_exists(args.expenses_path)) {
            std::cerr << "Error: Expenses file not found: " << args.expenses_path << "\n";
            valid = false;
        }
    }

    // Validate UDF file if provided
    if (!args.udfs_path.empty() && !file_exists(args.udfs_path)) {
        std::cerr << "Error: UDF script not found: " << args.udfs_path << "\n";
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

// Helper function to check if string ends with suffix
[[maybe_unused]] static bool ends_with(const std::string& str, const std::string& suffix) {
    if (str.length() < suffix.length()) return false;
    return str.compare(str.length() - suffix.length(), suffix.length(), suffix) == 0;
}

// Helper function to load assumptions from JSON config
struct AssumptionsConfig {
    std::string mortality_path;
    std::string lapse_path;
    std::string expenses_path;
    double mortality_mult = 1.0;
    double lapse_mult = 1.0;
    double expense_mult = 1.0;
    size_t scenario_count = 1000;
    uint64_t seed = 42;
    double initial_rate = 0.04;
    double drift = 0.0;
    double volatility = 0.015;
    double min_rate = 0.0;
    double max_rate = 0.20;
    bool udf_enabled = false;
    std::string udf_script;
    int udf_timeout_ms = 1000;
};

AssumptionsConfig parse_assumptions_config(const std::string& config_path) {
    std::ifstream f(config_path);
    if (!f.is_open()) {
        throw std::runtime_error("Failed to open assumptions config: " + config_path);
    }

    json j;
    try {
        f >> j;
    } catch (const json::exception& e) {
        throw std::runtime_error("Failed to parse JSON: " + std::string(e.what()));
    }

    AssumptionsConfig config;

    // Parse mortality assumptions
    if (j.contains("mortality")) {
        auto& mortality = j["mortality"];
        if (mortality.contains("source")) {
            std::string source = mortality["source"];
            if (source.find("local://") == 0) {
                config.mortality_path = source.substr(8); // Remove "local://" prefix
            } else if (source.find("assumptions://") == 0) {
                throw std::runtime_error("Assumptions Manager references (assumptions://) not yet supported in CLI. Use local:// paths.");
            } else {
                config.mortality_path = source; // Assume raw path
            }
        }
        if (mortality.contains("multiplier")) {
            config.mortality_mult = mortality["multiplier"];
        }
    }

    // Parse lapse assumptions
    if (j.contains("lapse")) {
        auto& lapse = j["lapse"];
        if (lapse.contains("source")) {
            std::string source = lapse["source"];
            if (source.find("local://") == 0) {
                config.lapse_path = source.substr(8);
            } else if (source.find("assumptions://") == 0) {
                throw std::runtime_error("Assumptions Manager references (assumptions://) not yet supported in CLI. Use local:// paths.");
            } else {
                config.lapse_path = source;
            }
        }
        if (lapse.contains("multiplier")) {
            config.lapse_mult = lapse["multiplier"];
        }
    }

    // Parse expense assumptions
    if (j.contains("expenses")) {
        auto& expenses = j["expenses"];
        if (expenses.contains("source")) {
            std::string source = expenses["source"];
            if (source.find("local://") == 0) {
                config.expenses_path = source.substr(8);
            } else if (source.find("assumptions://") == 0) {
                throw std::runtime_error("Assumptions Manager references (assumptions://) not yet supported in CLI. Use local:// paths.");
            } else {
                config.expenses_path = source;
            }
        }
        if (expenses.contains("multiplier")) {
            config.expense_mult = expenses["multiplier"];
        }
    }

    // Parse scenario config
    if (j.contains("scenarios")) {
        auto& scenarios = j["scenarios"];
        if (scenarios.contains("count")) config.scenario_count = scenarios["count"];
        if (scenarios.contains("seed")) config.seed = scenarios["seed"];
        if (scenarios.contains("initial_rate")) config.initial_rate = scenarios["initial_rate"];
        if (scenarios.contains("drift")) config.drift = scenarios["drift"];
        if (scenarios.contains("volatility")) config.volatility = scenarios["volatility"];
        if (scenarios.contains("min_rate")) config.min_rate = scenarios["min_rate"];
        if (scenarios.contains("max_rate")) config.max_rate = scenarios["max_rate"];
    }

    // Parse UDF config
    if (j.contains("udf")) {
        auto& udf = j["udf"];
        if (udf.contains("enabled")) config.udf_enabled = udf["enabled"];
        if (udf.contains("script")) config.udf_script = udf["script"];
        if (udf.contains("timeout_ms")) config.udf_timeout_ms = udf["timeout_ms"];
    }

    return config;
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
        // Override with config file if provided
        std::string mortality_path = args.mortality_path;
        std::string lapse_path = args.lapse_path;
        std::string expenses_path = args.expenses_path;
        std::string udf_script = args.udfs_path;
        int udf_timeout = args.udf_timeout_ms;

        if (!args.assumptions_config_path.empty()) {
            std::cerr << "Loading assumptions config: " << args.assumptions_config_path << "\n";
            AssumptionsConfig config = parse_assumptions_config(args.assumptions_config_path);

            // Override paths from config
            if (!config.mortality_path.empty()) mortality_path = config.mortality_path;
            if (!config.lapse_path.empty()) lapse_path = config.lapse_path;
            if (!config.expenses_path.empty()) expenses_path = config.expenses_path;

            // Override multipliers from config if not set via CLI
            if (args.mortality_multiplier == 1.0) args.mortality_multiplier = config.mortality_mult;
            if (args.lapse_multiplier == 1.0) args.lapse_multiplier = config.lapse_mult;
            if (args.expense_multiplier == 1.0) args.expense_multiplier = config.expense_mult;

            // Override scenario params from config if not set via CLI
            if (args.num_scenarios == 1000) args.num_scenarios = config.scenario_count;
            if (args.seed == 42) args.seed = config.seed;
            if (args.initial_rate == 0.04) args.initial_rate = config.initial_rate;
            if (args.drift == 0.0) args.drift = config.drift;
            if (args.volatility == 0.015) args.volatility = config.volatility;
            if (args.min_rate == 0.0) args.min_rate = config.min_rate;
            if (args.max_rate == 0.20) args.max_rate = config.max_rate;

            // Override UDF settings from config if not set via CLI
            if (udf_script.empty() && config.udf_enabled) {
                udf_script = config.udf_script;
                udf_timeout = config.udf_timeout_ms;
            }
        }

        // Load policies (CSV or Parquet)
        std::cerr << "Loading policies from " << args.policies_path << "..." << std::flush;
        livecalc::PolicySet policies;

#ifdef HAVE_ARROW
        if (ends_with(args.policies_path, ".parquet")) {
            policies = livecalc::io::read_policies_from_parquet(args.policies_path);
            std::cerr << " loaded " << policies.size() << " policies from Parquet\n";
        } else
#endif
        {
            policies = livecalc::PolicySet::load_from_csv(args.policies_path);
            std::cerr << " loaded " << policies.size() << " policies from CSV\n";
        }

        std::cerr << "Loading mortality table from " << mortality_path << "..." << std::flush;
        livecalc::MortalityTable mortality =
            livecalc::MortalityTable::load_from_csv(mortality_path);
        std::cerr << " done\n";

        std::cerr << "Loading lapse table from " << lapse_path << "..." << std::flush;
        livecalc::LapseTable lapse = livecalc::LapseTable::load_from_csv(lapse_path);
        std::cerr << " done\n";

        std::cerr << "Loading expense assumptions from " << expenses_path << "..." << std::flush;
        livecalc::ExpenseAssumptions expenses =
            livecalc::ExpenseAssumptions::load_from_csv(expenses_path);
        std::cerr << " done\n";

        // Generate scenarios
        std::cerr << "Generating " << args.num_scenarios << " scenarios..." << std::flush;
        livecalc::ScenarioGeneratorParams params(
            args.initial_rate, args.drift, args.volatility, args.min_rate, args.max_rate);
        livecalc::ScenarioSet scenarios =
            livecalc::ScenarioSet::generate(args.num_scenarios, params, args.seed);
        std::cerr << " done\n";

        // Initialize UDF context if UDF script provided
        livecalc::UDFContext udf_context;
        if (!udf_script.empty()) {
            std::cerr << "Initializing UDF context with script: " << udf_script << "\n";
            udf_context = livecalc::UDFContext(udf_script, udf_timeout);
            std::cerr << "  UDF timeout: " << udf_timeout << " ms\n";
        }

        // Configure valuation
        livecalc::ValuationConfig config;
        config.store_scenario_npvs = true;
        config.mortality_multiplier = args.mortality_multiplier;
        config.lapse_multiplier = args.lapse_multiplier;
        config.expense_multiplier = args.expense_multiplier;

        // Run valuation
        std::cerr << "Running valuation (" << policies.size() << " policies × "
                  << scenarios.size() << " scenarios = "
                  << (policies.size() * scenarios.size()) << " projections)";
        if (udf_context.enabled) {
            std::cerr << " with Python UDFs";
        }
        std::cerr << "...\n";

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

        // Report UDF metrics if UDFs were used
        if (udf_context.enabled && udf_context.udfs_called > 0) {
            std::cerr << "\nUDF Metrics:\n";
            std::cerr << "  Total calls:     " << udf_context.udfs_called << "\n";
            std::cerr << "  Total UDF time:  " << udf_context.udf_time_ms << " ms\n";
            std::cerr << "  UDF overhead:    " << (udf_context.udf_time_ms / result.execution_time_ms * 100.0) << "%\n";
        }

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
