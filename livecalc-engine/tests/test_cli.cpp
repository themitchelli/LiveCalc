#include <catch2/catch_test_macros.hpp>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>

namespace {

// Helper to run CLI command and capture output
struct CommandResult {
    int exit_code;
    std::string stdout_output;
    std::string stderr_output;
};

CommandResult run_command(const std::string& cmd) {
    CommandResult result;
    result.exit_code = 0;

    // Create temp files for output
    std::string stdout_file = "/tmp/livecalc_test_stdout.txt";
    std::string stderr_file = "/tmp/livecalc_test_stderr.txt";

    // Run command with output redirection
    std::string full_cmd = cmd + " >" + stdout_file + " 2>" + stderr_file;
    result.exit_code = std::system(full_cmd.c_str());

    // Read stdout
    std::ifstream stdout_stream(stdout_file);
    if (stdout_stream) {
        std::ostringstream ss;
        ss << stdout_stream.rdbuf();
        result.stdout_output = ss.str();
    }

    // Read stderr
    std::ifstream stderr_stream(stderr_file);
    if (stderr_stream) {
        std::ostringstream ss;
        ss << stderr_stream.rdbuf();
        result.stderr_output = ss.str();
    }

    // Normalize exit code (system() returns different values on different platforms)
    result.exit_code = WEXITSTATUS(result.exit_code);

    return result;
}

} // anonymous namespace

TEST_CASE("CLI help shows usage", "[cli]") {
    auto result = run_command("./livecalc-engine --help");
    REQUIRE(result.exit_code == 0);
    REQUIRE(result.stderr_output.find("Usage:") != std::string::npos);
    REQUIRE(result.stderr_output.find("--policies") != std::string::npos);
    REQUIRE(result.stderr_output.find("--mortality") != std::string::npos);
    REQUIRE(result.stderr_output.find("--lapse") != std::string::npos);
    REQUIRE(result.stderr_output.find("--expenses") != std::string::npos);
    REQUIRE(result.stderr_output.find("--scenarios") != std::string::npos);
    REQUIRE(result.stderr_output.find("--seed") != std::string::npos);
    REQUIRE(result.stderr_output.find("--output") != std::string::npos);
}

TEST_CASE("CLI no args shows usage", "[cli]") {
    auto result = run_command("./livecalc-engine");
    REQUIRE(result.exit_code == 0);
    REQUIRE(result.stderr_output.find("Usage:") != std::string::npos);
}

TEST_CASE("CLI missing required args fails", "[cli]") {
    SECTION("Missing policies") {
        auto result = run_command("./livecalc-engine --mortality ../data/sample_mortality.csv "
                                   "--lapse ../data/sample_lapse.csv --expenses ../data/sample_expenses.csv");
        REQUIRE(result.exit_code == 1);
        REQUIRE(result.stderr_output.find("--policies is required") != std::string::npos);
    }

    SECTION("Missing mortality") {
        auto result = run_command("./livecalc-engine --policies ../data/sample_policies.csv "
                                   "--lapse ../data/sample_lapse.csv --expenses ../data/sample_expenses.csv");
        REQUIRE(result.exit_code == 1);
        REQUIRE(result.stderr_output.find("--mortality is required") != std::string::npos);
    }

    SECTION("Missing lapse") {
        auto result = run_command("./livecalc-engine --policies ../data/sample_policies.csv "
                                   "--mortality ../data/sample_mortality.csv --expenses ../data/sample_expenses.csv");
        REQUIRE(result.exit_code == 1);
        REQUIRE(result.stderr_output.find("--lapse is required") != std::string::npos);
    }

    SECTION("Missing expenses") {
        auto result = run_command("./livecalc-engine --policies ../data/sample_policies.csv "
                                   "--mortality ../data/sample_mortality.csv --lapse ../data/sample_lapse.csv");
        REQUIRE(result.exit_code == 1);
        REQUIRE(result.stderr_output.find("--expenses is required") != std::string::npos);
    }
}

TEST_CASE("CLI invalid file path fails", "[cli]") {
    auto result = run_command("./livecalc-engine --policies nonexistent.csv "
                               "--mortality ../data/sample_mortality.csv "
                               "--lapse ../data/sample_lapse.csv --expenses ../data/sample_expenses.csv");
    REQUIRE(result.exit_code == 1);
    REQUIRE(result.stderr_output.find("not found") != std::string::npos);
}

TEST_CASE("CLI unknown option fails", "[cli]") {
    auto result = run_command("./livecalc-engine --unknown-option");
    REQUIRE(result.exit_code == 1);
    REQUIRE(result.stderr_output.find("Unknown option") != std::string::npos);
}

TEST_CASE("CLI full valuation runs successfully", "[cli][integration]") {
    auto result = run_command("./livecalc-engine "
                               "--policies ../data/sample_policies.csv "
                               "--mortality ../data/sample_mortality.csv "
                               "--lapse ../data/sample_lapse.csv "
                               "--expenses ../data/sample_expenses.csv "
                               "--scenarios 100 --seed 42");

    REQUIRE(result.exit_code == 0);

    // Check stderr progress messages
    REQUIRE(result.stderr_output.find("Loading policies") != std::string::npos);
    REQUIRE(result.stderr_output.find("loaded 10 policies") != std::string::npos);
    REQUIRE(result.stderr_output.find("Loading mortality") != std::string::npos);
    REQUIRE(result.stderr_output.find("Loading lapse") != std::string::npos);
    REQUIRE(result.stderr_output.find("Loading expense") != std::string::npos);
    REQUIRE(result.stderr_output.find("Generating 100 scenarios") != std::string::npos);
    REQUIRE(result.stderr_output.find("Running valuation") != std::string::npos);
    REQUIRE(result.stderr_output.find("1000 projections") != std::string::npos);
    REQUIRE(result.stderr_output.find("Results:") != std::string::npos);
    REQUIRE(result.stderr_output.find("Execution:") != std::string::npos);

    // Check JSON output structure
    REQUIRE(result.stdout_output.find("\"statistics\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"mean_npv\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"std_dev\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"percentiles\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"p50\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"p75\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"p90\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"p95\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"p99\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"cte_95\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"execution_time_ms\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"scenario_count\"") != std::string::npos);
    REQUIRE(result.stdout_output.find("\"distribution\"") != std::string::npos);
}

TEST_CASE("CLI output to file works", "[cli][integration]") {
    std::string output_file = "/tmp/livecalc_test_output.json";

    // Remove any existing file
    std::remove(output_file.c_str());

    auto result = run_command("./livecalc-engine "
                               "--policies ../data/sample_policies.csv "
                               "--mortality ../data/sample_mortality.csv "
                               "--lapse ../data/sample_lapse.csv "
                               "--expenses ../data/sample_expenses.csv "
                               "--scenarios 50 --seed 42 "
                               "--output " + output_file);

    REQUIRE(result.exit_code == 0);
    REQUIRE(result.stderr_output.find("Output written to:") != std::string::npos);

    // Check file was created and contains valid JSON
    std::ifstream f(output_file);
    REQUIRE(f.good());

    std::ostringstream ss;
    ss << f.rdbuf();
    std::string json = ss.str();

    REQUIRE(json.find("\"statistics\"") != std::string::npos);
    REQUIRE(json.find("\"mean_npv\"") != std::string::npos);

    // Cleanup
    std::remove(output_file.c_str());
}

TEST_CASE("CLI seed reproducibility", "[cli][integration]") {
    // Run twice with same seed
    auto result1 = run_command("./livecalc-engine "
                                "--policies ../data/sample_policies.csv "
                                "--mortality ../data/sample_mortality.csv "
                                "--lapse ../data/sample_lapse.csv "
                                "--expenses ../data/sample_expenses.csv "
                                "--scenarios 50 --seed 12345");

    auto result2 = run_command("./livecalc-engine "
                                "--policies ../data/sample_policies.csv "
                                "--mortality ../data/sample_mortality.csv "
                                "--lapse ../data/sample_lapse.csv "
                                "--expenses ../data/sample_expenses.csv "
                                "--scenarios 50 --seed 12345");

    REQUIRE(result1.exit_code == 0);
    REQUIRE(result2.exit_code == 0);

    // The JSON output (minus execution time) should be the same
    // Extract distribution from both (which includes scenario NPVs)
    auto find_distribution = [](const std::string& json) -> std::string {
        auto pos = json.find("\"distribution\":");
        if (pos == std::string::npos) return "";
        auto end = json.find("]", pos);
        if (end == std::string::npos) return "";
        return json.substr(pos, end - pos + 1);
    };

    REQUIRE(find_distribution(result1.stdout_output) == find_distribution(result2.stdout_output));
}

TEST_CASE("CLI multipliers affect results", "[cli][integration]") {
    // Run with default multipliers
    auto baseline = run_command("./livecalc-engine "
                                 "--policies ../data/sample_policies.csv "
                                 "--mortality ../data/sample_mortality.csv "
                                 "--lapse ../data/sample_lapse.csv "
                                 "--expenses ../data/sample_expenses.csv "
                                 "--scenarios 50 --seed 42");

    // Run with higher mortality (should decrease NPV since more death benefits paid)
    auto high_mortality = run_command("./livecalc-engine "
                                       "--policies ../data/sample_policies.csv "
                                       "--mortality ../data/sample_mortality.csv "
                                       "--lapse ../data/sample_lapse.csv "
                                       "--expenses ../data/sample_expenses.csv "
                                       "--scenarios 50 --seed 42 "
                                       "--mortality-mult 1.5");

    REQUIRE(baseline.exit_code == 0);
    REQUIRE(high_mortality.exit_code == 0);

    // Verify multipliers are reported in stderr
    REQUIRE(high_mortality.stderr_output.find("Multipliers:") != std::string::npos);
    REQUIRE(high_mortality.stderr_output.find("mortality=1.5") != std::string::npos);

    // The outputs should be different (we can't easily compare exact values without parsing JSON)
    REQUIRE(baseline.stdout_output != high_mortality.stdout_output);
}

TEST_CASE("CLI scenario generation parameters", "[cli][integration]") {
    auto result = run_command("./livecalc-engine "
                               "--policies ../data/sample_policies.csv "
                               "--mortality ../data/sample_mortality.csv "
                               "--lapse ../data/sample_lapse.csv "
                               "--expenses ../data/sample_expenses.csv "
                               "--scenarios 100 --seed 42 "
                               "--initial-rate 0.05 "
                               "--volatility 0.02 "
                               "--drift 0.001 "
                               "--min-rate 0.01 "
                               "--max-rate 0.15");

    REQUIRE(result.exit_code == 0);
    REQUIRE(result.stdout_output.find("\"statistics\"") != std::string::npos);
}

TEST_CASE("CLI validation errors", "[cli]") {
    SECTION("Zero scenarios") {
        auto result = run_command("./livecalc-engine "
                                   "--policies ../data/sample_policies.csv "
                                   "--mortality ../data/sample_mortality.csv "
                                   "--lapse ../data/sample_lapse.csv "
                                   "--expenses ../data/sample_expenses.csv "
                                   "--scenarios 0");
        REQUIRE(result.exit_code == 1);
        REQUIRE(result.stderr_output.find("--scenarios must be greater than 0") != std::string::npos);
    }

    SECTION("Invalid initial rate") {
        auto result = run_command("./livecalc-engine "
                                   "--policies ../data/sample_policies.csv "
                                   "--mortality ../data/sample_mortality.csv "
                                   "--lapse ../data/sample_lapse.csv "
                                   "--expenses ../data/sample_expenses.csv "
                                   "--initial-rate 2.0");
        REQUIRE(result.exit_code == 1);
        REQUIRE(result.stderr_output.find("--initial-rate must be between 0 and 1.0") != std::string::npos);
    }

    SECTION("Negative volatility") {
        auto result = run_command("./livecalc-engine "
                                   "--policies ../data/sample_policies.csv "
                                   "--mortality ../data/sample_mortality.csv "
                                   "--lapse ../data/sample_lapse.csv "
                                   "--expenses ../data/sample_expenses.csv "
                                   "--volatility -0.01");
        REQUIRE(result.exit_code == 1);
        REQUIRE(result.stderr_output.find("--volatility must be non-negative") != std::string::npos);
    }

    SECTION("Min rate exceeds max rate") {
        auto result = run_command("./livecalc-engine "
                                   "--policies ../data/sample_policies.csv "
                                   "--mortality ../data/sample_mortality.csv "
                                   "--lapse ../data/sample_lapse.csv "
                                   "--expenses ../data/sample_expenses.csv "
                                   "--min-rate 0.10 --max-rate 0.05");
        REQUIRE(result.exit_code == 1);
        REQUIRE(result.stderr_output.find("--min-rate cannot exceed --max-rate") != std::string::npos);
    }

    SECTION("Non-positive multiplier") {
        auto result = run_command("./livecalc-engine "
                                   "--policies ../data/sample_policies.csv "
                                   "--mortality ../data/sample_mortality.csv "
                                   "--lapse ../data/sample_lapse.csv "
                                   "--expenses ../data/sample_expenses.csv "
                                   "--mortality-mult 0");
        REQUIRE(result.exit_code == 1);
        REQUIRE(result.stderr_output.find("--mortality-mult must be positive") != std::string::npos);
    }
}
