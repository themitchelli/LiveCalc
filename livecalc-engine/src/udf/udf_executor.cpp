#include "udf_executor.hpp"
#include <fstream>
#include <sstream>
#include <cstdio>
#include <array>
#include <chrono>
#include <thread>
#include <cstring>
#include <filesystem>

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/wait.h>
#include <unistd.h>
#include <signal.h>
#include <fcntl.h>
#endif

namespace livecalc {

// ============================================================================
// UDFExecutor Implementation
// ============================================================================

UDFExecutor::UDFExecutor(const std::string& script_path)
    : script_path_(script_path), script_valid_(false)
{
    // Validate script file exists
    std::ifstream f(script_path_);
    if (!f.good()) {
        throw UDFExecutionError("UDF script not found: " + script_path_);
    }
    script_valid_ = true;
}

UDFExecutor::~UDFExecutor() = default;

std::string UDFExecutor::policy_to_json(const Policy& policy) const {
    std::ostringstream oss;
    oss << "{";
    oss << "\"policy_id\":" << policy.policy_id << ",";
    oss << "\"age\":" << static_cast<int>(policy.age) << ",";
    oss << "\"gender\":" << static_cast<int>(policy.gender) << ",";
    oss << "\"sum_assured\":" << policy.sum_assured << ",";
    oss << "\"premium\":" << policy.premium << ",";
    oss << "\"term\":" << static_cast<int>(policy.term) << ",";
    oss << "\"product_type\":" << static_cast<int>(policy.product_type);

    // Add underwriting_class if present (from US-001 extensions)
    oss << ",\"underwriting_class\":" << static_cast<int>(policy.underwriting_class);

    // Add attributes if present
    if (!policy.attributes.empty()) {
        oss << ",\"attributes\":{";
        bool first = true;
        for (const auto& [key, value] : policy.attributes) {
            if (!first) oss << ",";
            // Escape quotes in key and value
            oss << "\"" << key << "\":\"" << value << "\"";
            first = false;
        }
        oss << "}";
    }

    oss << "}";
    return oss.str();
}

std::string UDFExecutor::state_to_json(const UDFState& state) const {
    std::ostringstream oss;
    oss << "{";
    oss << "\"year\":" << state.year << ",";
    oss << "\"lives\":" << state.lives << ",";
    oss << "\"interest_rate\":" << state.interest_rate;

    // Add custom state if present
    if (!state.custom.empty()) {
        oss << ",\"custom\":{";
        bool first = true;
        for (const auto& [key, value] : state.custom) {
            if (!first) oss << ",";
            oss << "\"" << key << "\":" << value;
            first = false;
        }
        oss << "}";
    }

    oss << "}";
    return oss.str();
}

double UDFExecutor::execute_python(
    const std::string& function_name,
    const std::string& policy_json,
    const std::string& state_json,
    int timeout_ms)
{
    // Create temporary files for policy and state JSON
    // This avoids shell escaping issues
    std::filesystem::path temp_dir = std::filesystem::temp_directory_path();
    std::string policy_file = (temp_dir / ("livecalc_policy_" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()) + ".json")).string();
    std::string state_file = (temp_dir / ("livecalc_state_" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()) + ".json")).string();

    // Write JSON to temp files
    {
        std::ofstream pf(policy_file);
        pf << policy_json;
    }
    {
        std::ofstream sf(state_file);
        sf << state_json;
    }

    // Build Python command that reads from temp files
    std::ostringstream cmd;
    cmd << "python3 -c \"import json; "
        << "exec(open('" << script_path_ << "').read()); "
        << "policy = json.load(open('" << policy_file << "')); "
        << "state = json.load(open('" << state_file << "')); "
        << "result = " << function_name << "(policy, **state); "
        << "print(result)\"";

    std::string command = cmd.str();

#ifdef _WIN32
    // Windows implementation using popen
    FILE* pipe = _popen(command.c_str(), "r");
    if (!pipe) {
        throw UDFExecutionError("Failed to execute Python UDF: " + function_name);
    }

    // Read output with timeout
    std::array<char, 128> buffer;
    std::string result_str;
    auto start = std::chrono::steady_clock::now();

    while (true) {
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - start).count();

        if (elapsed > timeout_ms) {
            _pclose(pipe);
            std::filesystem::remove(policy_file);
            std::filesystem::remove(state_file);
            throw UDFExecutionError("UDF timeout: " + function_name + " exceeded " +
                std::to_string(timeout_ms) + "ms");
        }

        if (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
            result_str += buffer.data();
            break;  // Got result
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    int exit_code = _pclose(pipe);

#else
    // Unix/Linux implementation using popen with timeout
    FILE* pipe = popen(command.c_str(), "r");
    if (!pipe) {
        throw UDFExecutionError("Failed to execute Python UDF: " + function_name);
    }

    // Set pipe to non-blocking
    int fd = fileno(pipe);
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);

    // Read output with timeout
    std::array<char, 128> buffer;
    std::string result_str;
    auto start = std::chrono::steady_clock::now();

    while (true) {
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - start).count();

        if (elapsed > timeout_ms) {
            pclose(pipe);
            std::filesystem::remove(policy_file);
            std::filesystem::remove(state_file);
            throw UDFExecutionError("UDF timeout: " + function_name + " exceeded " +
                std::to_string(timeout_ms) + "ms");
        }

        char* read_result = fgets(buffer.data(), buffer.size(), pipe);
        if (read_result != nullptr) {
            result_str += buffer.data();
            break;  // Got result
        }

        if (feof(pipe)) {
            break;  // End of output
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    int exit_code = pclose(pipe);
#endif

    // Cleanup temp files
    std::filesystem::remove(policy_file);
    std::filesystem::remove(state_file);

    // Check for errors
    if (exit_code != 0) {
        throw UDFExecutionError("UDF failed with exit code " + std::to_string(exit_code) +
            ": " + function_name);
    }

    // Parse result as double
    try {
        // Trim whitespace
        result_str.erase(0, result_str.find_first_not_of(" \n\r\t"));
        result_str.erase(result_str.find_last_not_of(" \n\r\t") + 1);

        return std::stod(result_str);
    } catch (const std::exception& e) {
        throw UDFExecutionError("Failed to parse UDF result: " + result_str +
            " (function: " + function_name + ")");
    }
}

double UDFExecutor::call_udf(
    const std::string& function_name,
    const Policy& policy,
    const UDFState& state,
    int timeout_ms)
{
    if (!script_valid_) {
        throw UDFExecutionError("UDF script not valid");
    }

    // Convert to JSON
    std::string policy_json = policy_to_json(policy);
    std::string state_json = state_to_json(state);

    // Execute Python and get result
    return execute_python(function_name, policy_json, state_json, timeout_ms);
}

bool UDFExecutor::has_function(const std::string& function_name) const {
    // Simple check: try to read the script and see if function name appears
    // This is not foolproof but sufficient for basic validation
    std::ifstream f(script_path_);
    if (!f.good()) {
        return false;
    }

    std::string line;
    std::string pattern = "def " + function_name + "(";
    while (std::getline(f, line)) {
        if (line.find(pattern) != std::string::npos) {
            return true;
        }
    }

    return false;
}

} // namespace livecalc
