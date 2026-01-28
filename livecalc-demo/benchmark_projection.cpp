/**
 * LiveCalc Demo - Projection-Only Benchmark
 *
 * US-002: Baseline projection benchmark to measure horsepower
 * Target: 1M policies × 1K scenarios × 40 years in <120 seconds
 *
 * This benchmark:
 * - Loads 1M policies from Parquet file
 * - Generates 1K economic scenarios
 * - Runs core projection (no UDFs, no solver)
 * - Measures timing and memory usage
 * - Outputs JSON results with detailed breakdown
 */

#include <iostream>
#include <fstream>
#include <chrono>
#include <iomanip>
#include <sys/resource.h>
#include <nlohmann/json.hpp>

// LiveCalc engine headers (relative to engine directory)
#include "../livecalc-engine/src/policy.hpp"
#include "../livecalc-engine/src/assumptions.hpp"
#include "../livecalc-engine/src/scenario.hpp"
#include "../livecalc-engine/src/valuation.hpp"
#include "../livecalc-engine/src/projection.hpp"
#include "../livecalc-engine/src/io/parquet_reader.hpp"
#include "../livecalc-engine/src/io/csv_reader.hpp"

using json = nlohmann::json;
using namespace livecalc;
using namespace std::chrono;

/**
 * Get peak resident set size (memory usage) in bytes
 */
size_t get_peak_rss() {
    struct rusage usage;
    getrusage(RUSAGE_SELF, &usage);
#ifdef __APPLE__
    return usage.ru_maxrss;  // bytes on macOS
#else
    return usage.ru_maxrss * 1024;  // kilobytes on Linux
#endif
}

/**
 * Benchmark configuration
 */
struct BenchmarkConfig {
    std::string policies_path;
    std::string mortality_path;
    std::string lapse_path;
    std::string expenses_path;
    size_t num_scenarios = 1000;
    size_t projection_years = 40;
    uint64_t seed = 42;
    std::string output_path;

    // Scenario generation parameters
    double initial_rate = 0.04;
    double drift = 0.0;
    double volatility = 0.015;
    double min_rate = 0.0;
    double max_rate = 0.20;
};

/**
 * Benchmark results with detailed timing breakdown
 */
struct BenchmarkResults {
    // Timing (milliseconds)
    double total_time_ms = 0.0;
    double load_policies_ms = 0.0;
    double load_assumptions_ms = 0.0;
    double generate_scenarios_ms = 0.0;
    double projection_ms = 0.0;
    double postprocess_ms = 0.0;

    // Memory (bytes)
    size_t peak_memory_bytes = 0;

    // Counts
    size_t num_policies = 0;
    size_t num_scenarios = 0;
    size_t projection_years = 0;

    // Performance metrics
    double calculations_per_second = 0.0;
    double total_calculations = 0.0;

    // Valuation results (aggregated)
    double mean_npv = 0.0;
    double std_dev = 0.0;
    double median_npv = 0.0;

    // Config
    uint64_t seed = 0;
    std::string policies_path;
    std::string timestamp;

    /**
     * Convert results to JSON
     */
    json to_json() const {
        json j;

        // Metadata
        j["benchmark"] = "projection-only";
        j["timestamp"] = timestamp;
        j["seed"] = seed;

        // Configuration
        j["config"] = {
            {"policies_path", policies_path},
            {"num_policies", num_policies},
            {"num_scenarios", num_scenarios},
            {"projection_years", projection_years}
        };

        // Timing breakdown (milliseconds)
        j["timing_ms"] = {
            {"total", total_time_ms},
            {"load_policies", load_policies_ms},
            {"load_assumptions", load_assumptions_ms},
            {"generate_scenarios", generate_scenarios_ms},
            {"projection", projection_ms},
            {"postprocess", postprocess_ms}
        };

        // Timing breakdown (seconds for readability)
        j["timing_seconds"] = {
            {"total", total_time_ms / 1000.0},
            {"load_policies", load_policies_ms / 1000.0},
            {"load_assumptions", load_assumptions_ms / 1000.0},
            {"generate_scenarios", generate_scenarios_ms / 1000.0},
            {"projection", projection_ms / 1000.0},
            {"postprocess", postprocess_ms / 1000.0}
        };

        // Memory
        j["memory"] = {
            {"peak_bytes", peak_memory_bytes},
            {"peak_mb", peak_memory_bytes / (1024.0 * 1024.0)},
            {"peak_gb", peak_memory_bytes / (1024.0 * 1024.0 * 1024.0)}
        };

        // Performance metrics
        j["performance"] = {
            {"total_calculations", total_calculations},
            {"calculations_per_second", calculations_per_second},
            {"projections_per_second", (num_policies * num_scenarios) / (projection_ms / 1000.0)}
        };

        // Valuation results
        j["results"] = {
            {"mean_npv", mean_npv},
            {"std_dev", std_dev},
            {"median_npv", median_npv}
        };

        // Success/failure indicators
        j["success"] = (total_time_ms > 0 && num_policies > 0);
        j["meets_target"] = (total_time_ms / 1000.0 < 120.0);  // <120 seconds target

        return j;
    }
};

/**
 * Run the projection benchmark
 */
BenchmarkResults run_benchmark(const BenchmarkConfig& config) {
    BenchmarkResults results;
    results.seed = config.seed;
    results.policies_path = config.policies_path;
    results.num_scenarios = config.num_scenarios;
    results.projection_years = config.projection_years;

    // Get current timestamp
    auto now = system_clock::now();
    auto now_time_t = system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&now_time_t), "%Y-%m-%d %H:%M:%S");
    results.timestamp = ss.str();

    auto benchmark_start = high_resolution_clock::now();

    std::cout << "=== LiveCalc Projection-Only Benchmark ===" << std::endl;
    std::cout << "Target: 1M policies × 1K scenarios × 40 years in <120s" << std::endl;
    std::cout << std::endl;

    // Step 1: Load policies
    std::cout << "[1/5] Loading policies from " << config.policies_path << "..." << std::endl;
    auto start = high_resolution_clock::now();

    PolicySet policies;
    try {
#ifdef HAVE_ARROW
        policies = ParquetReader::load_policies(config.policies_path);
#else
        throw std::runtime_error("Parquet support not available (HAVE_ARROW not defined)");
#endif
    } catch (const std::exception& e) {
        std::cerr << "Error loading policies: " << e.what() << std::endl;
        return results;
    }

    auto end = high_resolution_clock::now();
    results.load_policies_ms = duration_cast<milliseconds>(end - start).count();
    results.num_policies = policies.size();

    std::cout << "  Loaded " << results.num_policies << " policies in "
              << results.load_policies_ms << " ms" << std::endl;

    // Step 2: Load assumptions
    std::cout << "[2/5] Loading assumptions..." << std::endl;
    start = high_resolution_clock::now();

    MortalityTable mortality;
    LapseTable lapse;
    ExpenseAssumptions expenses(0, 0, 0, 0);  // Default

    try {
        CSVReader csv_reader;
        mortality = csv_reader.load_mortality_table(config.mortality_path);
        lapse = csv_reader.load_lapse_table(config.lapse_path);
        expenses = csv_reader.load_expense_assumptions(config.expenses_path);
    } catch (const std::exception& e) {
        std::cerr << "Error loading assumptions: " << e.what() << std::endl;
        return results;
    }

    end = high_resolution_clock::now();
    results.load_assumptions_ms = duration_cast<milliseconds>(end - start).count();

    std::cout << "  Loaded assumptions in " << results.load_assumptions_ms << " ms" << std::endl;

    // Step 3: Generate scenarios
    std::cout << "[3/5] Generating " << config.num_scenarios << " scenarios..." << std::endl;
    start = high_resolution_clock::now();

    ScenarioGeneratorParams params(
        config.initial_rate,
        config.drift,
        config.volatility,
        config.min_rate,
        config.max_rate
    );
    ScenarioSet scenarios = ScenarioSet::generate(config.num_scenarios, params, config.seed);

    end = high_resolution_clock::now();
    results.generate_scenarios_ms = duration_cast<milliseconds>(end - start).count();

    std::cout << "  Generated scenarios in " << results.generate_scenarios_ms << " ms" << std::endl;

    // Step 4: Run projection
    std::cout << "[4/5] Running projection..." << std::endl;
    std::cout << "  Policies: " << results.num_policies << std::endl;
    std::cout << "  Scenarios: " << config.num_scenarios << std::endl;
    std::cout << "  Projection years: " << config.projection_years << std::endl;
    std::cout << "  Total projections: " << results.num_policies * config.num_scenarios << std::endl;
    std::cout << std::endl;

    start = high_resolution_clock::now();

    ValuationConfig val_config;
    val_config.store_scenario_npvs = false;  // Don't store for performance

    ValuationResult result;
    try {
        result = run_valuation(policies, mortality, lapse, expenses, scenarios, val_config);
    } catch (const std::exception& e) {
        std::cerr << "Error running projection: " << e.what() << std::endl;
        return results;
    }

    end = high_resolution_clock::now();
    results.projection_ms = duration_cast<milliseconds>(end - start).count();

    std::cout << "  Projection complete in " << results.projection_ms << " ms "
              << "(" << results.projection_ms / 1000.0 << " seconds)" << std::endl;

    // Step 5: Post-process results
    std::cout << "[5/5] Post-processing results..." << std::endl;
    start = high_resolution_clock::now();

    results.mean_npv = result.mean_npv;
    results.std_dev = result.std_dev;
    results.median_npv = result.p50();

    end = high_resolution_clock::now();
    results.postprocess_ms = duration_cast<milliseconds>(end - start).count();

    auto benchmark_end = high_resolution_clock::now();
    results.total_time_ms = duration_cast<milliseconds>(benchmark_end - benchmark_start).count();

    // Calculate performance metrics
    results.total_calculations = results.num_policies * config.num_scenarios * config.projection_years;
    results.calculations_per_second = results.total_calculations / (results.total_time_ms / 1000.0);

    // Get peak memory usage
    results.peak_memory_bytes = get_peak_rss();

    // Print summary
    std::cout << std::endl;
    std::cout << "=== Benchmark Results ===" << std::endl;
    std::cout << std::fixed << std::setprecision(2);
    std::cout << "Total time:       " << results.total_time_ms / 1000.0 << " seconds" << std::endl;
    std::cout << "Projection time:  " << results.projection_ms / 1000.0 << " seconds" << std::endl;
    std::cout << "Peak memory:      " << results.peak_memory_bytes / (1024.0 * 1024.0) << " MB" << std::endl;
    std::cout << std::endl;
    std::cout << "Performance:" << std::endl;
    std::cout << "  Total calculations:  " << results.total_calculations / 1e9 << " billion" << std::endl;
    std::cout << "  Calculations/second: " << results.calculations_per_second / 1e6 << " million" << std::endl;
    std::cout << "  Projections/second:  " << (results.num_policies * config.num_scenarios) / (results.projection_ms / 1000.0) << std::endl;
    std::cout << std::endl;
    std::cout << "Results:" << std::endl;
    std::cout << "  Mean NPV:    £" << results.mean_npv / 1e6 << "M" << std::endl;
    std::cout << "  Std Dev:     £" << results.std_dev / 1e6 << "M" << std::endl;
    std::cout << "  Median NPV:  £" << results.median_npv / 1e6 << "M" << std::endl;
    std::cout << std::endl;

    bool meets_target = (results.total_time_ms / 1000.0) < 120.0;
    if (meets_target) {
        std::cout << "✓ PASS: Benchmark completed in <120 seconds" << std::endl;
    } else {
        std::cout << "✗ FAIL: Benchmark exceeded 120 second target" << std::endl;
    }

    return results;
}

int main(int argc, char** argv) {
    // Default config for demo
    BenchmarkConfig config;
    config.policies_path = "data/policies_1m.parquet";
    config.mortality_path = "data/assumptions/mortality_demo.csv";
    config.lapse_path = "data/assumptions/lapse_demo.csv";
    config.expenses_path = "data/assumptions/expenses_demo.json";
    config.num_scenarios = 1000;
    config.projection_years = 40;
    config.seed = 42;
    config.output_path = "results/benchmark_projection.json";

    // Simple argument parsing
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--policies" && i + 1 < argc) {
            config.policies_path = argv[++i];
        } else if (arg == "--mortality" && i + 1 < argc) {
            config.mortality_path = argv[++i];
        } else if (arg == "--lapse" && i + 1 < argc) {
            config.lapse_path = argv[++i];
        } else if (arg == "--expenses" && i + 1 < argc) {
            config.expenses_path = argv[++i];
        } else if (arg == "--scenarios" && i + 1 < argc) {
            config.num_scenarios = std::stoull(argv[++i]);
        } else if (arg == "--years" && i + 1 < argc) {
            config.projection_years = std::stoull(argv[++i]);
        } else if (arg == "--seed" && i + 1 < argc) {
            config.seed = std::stoull(argv[++i]);
        } else if (arg == "--output" && i + 1 < argc) {
            config.output_path = argv[++i];
        } else if (arg == "--help") {
            std::cout << "Usage: " << argv[0] << " [options]" << std::endl;
            std::cout << std::endl;
            std::cout << "Options:" << std::endl;
            std::cout << "  --policies <path>   Path to policies Parquet file (default: data/policies_1m.parquet)" << std::endl;
            std::cout << "  --mortality <path>  Path to mortality CSV file (default: data/assumptions/mortality_demo.csv)" << std::endl;
            std::cout << "  --lapse <path>      Path to lapse CSV file (default: data/assumptions/lapse_demo.csv)" << std::endl;
            std::cout << "  --expenses <path>   Path to expenses JSON file (default: data/assumptions/expenses_demo.json)" << std::endl;
            std::cout << "  --scenarios <n>     Number of scenarios (default: 1000)" << std::endl;
            std::cout << "  --years <n>         Projection years (default: 40)" << std::endl;
            std::cout << "  --seed <n>          Random seed (default: 42)" << std::endl;
            std::cout << "  --output <path>     Output JSON file (default: results/benchmark_projection.json)" << std::endl;
            std::cout << "  --help              Show this help message" << std::endl;
            return 0;
        }
    }

    // Run benchmark
    BenchmarkResults results = run_benchmark(config);

    // Write results to JSON
    if (!config.output_path.empty() && results.num_policies > 0) {
        std::cout << std::endl;
        std::cout << "Writing results to " << config.output_path << "..." << std::endl;

        json j = results.to_json();
        std::ofstream out(config.output_path);
        out << std::setw(2) << j << std::endl;
        out.close();

        std::cout << "✓ Results saved" << std::endl;
    }

    return (results.num_policies > 0 && results.total_time_ms / 1000.0 < 120.0) ? 0 : 1;
}
