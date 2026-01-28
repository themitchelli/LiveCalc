/**
 * @file projection_engine.cpp
 * @brief Implementation of C++ Projection Engine
 */

#include "projection_engine.hpp"
#include <chrono>
#include <sstream>
#include <cstring>

namespace livecalc {

ProjectionEngine::ProjectionEngine()
    : initialized_(false), num_scenarios_(1000), projection_years_(50), seed_(42) {
}

ProjectionEngine::~ProjectionEngine() {
    dispose();
}

void ProjectionEngine::initialize(
    const std::map<std::string, std::string>& config,
    const AMCredentials* credentials
) {
    if (initialized_) {
        throw InitializationError("Engine already initialized. Call dispose() first.");
    }

    // Validate configuration
    validate_config(config);

    // Store config and credentials
    config_ = config;
    if (credentials && credentials->is_valid()) {
        credentials_ = std::make_unique<AMCredentials>(*credentials);
    }

    // Parse configuration parameters
    auto it = config.find("num_scenarios");
    if (it != config.end()) {
        num_scenarios_ = std::stoul(it->second);
    }

    it = config.find("projection_years");
    if (it != config.end()) {
        projection_years_ = std::stoul(it->second);
        if (projection_years_ < 1 || projection_years_ > 100) {
            throw ConfigurationError("projection_years must be between 1 and 100");
        }
    }

    it = config.find("seed");
    if (it != config.end()) {
        seed_ = std::stoul(it->second);
    }

    // Load assumptions (from AM or local files)
    load_assumptions();

    // Generate scenarios
    generate_scenarios();

    initialized_ = true;
}

EngineInfo ProjectionEngine::get_info() const {
    return EngineInfo(
        "C++ Projection Engine",
        "1.0.0",
        "projection",
        true,  // supports_assumptions_manager
        1024 * 1024 * 1024  // 1GB max buffer
    );
}

ExecutionResult ProjectionEngine::runChunk(
    const uint8_t* input_buffer,
    size_t input_size,
    uint8_t* output_buffer,
    size_t output_size
) {
    if (!initialized_) {
        throw ExecutionError("Engine not initialized. Call initialize() first.");
    }

    ExecutionResult result;
    auto start = std::chrono::high_resolution_clock::now();

    try {
        // Parse policy buffer
        PolicySet policies = parse_policy_buffer(input_buffer, input_size);
        result.rows_processed = policies.size();

        // Run valuation
        ValuationConfig val_config;
        val_config.store_scenario_npvs = false;  // Don't store full distribution for output

        ValuationResult val_result = run_valuation(
            policies,
            assumptions_->get_mortality_table(),
            assumptions_->get_lapse_table(),
            assumptions_->get_expense_assumptions(),
            *scenarios_,
            val_config
        );

        // Write results to output buffer
        write_results_buffer(val_result, output_buffer, output_size);
        result.bytes_written = num_scenarios_ * 16;  // 16 bytes per scenario result

        // Add warnings if any
        if (val_result.scenarios_failed > 0) {
            std::stringstream ss;
            ss << val_result.scenarios_failed << " scenarios failed during execution";
            result.warnings.push_back(ss.str());
        }

        result.success = true;

    } catch (const std::exception& e) {
        result.success = false;
        result.error_message = e.what();
    }

    auto end = std::chrono::high_resolution_clock::now();
    result.execution_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

    return result;
}

void ProjectionEngine::dispose() noexcept {
    try {
        assumptions_.reset();
        scenarios_.reset();
        credentials_.reset();
        config_.clear();
        initialized_ = false;
    } catch (...) {
        // Suppress all exceptions (dispose must be noexcept)
    }
}

void ProjectionEngine::validate_config(const std::map<std::string, std::string>& config) {
    // Check required fields
    std::vector<std::string> required = {"mortality_table", "lapse_table", "expenses"};
    for (const auto& key : required) {
        if (config.find(key) == config.end()) {
            throw ConfigurationError("Missing required configuration: " + key);
        }
    }
}

void ProjectionEngine::load_assumptions() {
    assumptions_ = std::make_unique<AssumptionSet>();

    // If AM credentials available, try to resolve from AM
    if (credentials_ && credentials_->is_valid()) {
        // Use AssumptionsClient to resolve
        // For now, fall back to file loading
        // TODO: Implement AM resolution in future PR
    }

    // Load from local files
    try {
        assumptions_->load_from_files(
            config_["mortality_table"],
            config_["lapse_table"],
            config_["expenses"]
        );
    } catch (const std::exception& e) {
        throw InitializationError("Failed to load assumptions: " + std::string(e.what()));
    }
}

void ProjectionEngine::generate_scenarios() {
    scenarios_ = std::make_unique<ScenarioSet>();

    // Parse scenario generation parameters from config
    double initial_rate = 0.03;  // Default 3%
    double drift = 0.02;
    double volatility = 0.015;
    double min_rate = 0.001;
    double max_rate = 0.10;

    auto it = config_.find("initial_rate");
    if (it != config_.end()) {
        initial_rate = std::stod(it->second);
    }

    it = config_.find("drift");
    if (it != config_.end()) {
        drift = std::stod(it->second);
    }

    it = config_.find("volatility");
    if (it != config_.end()) {
        volatility = std::stod(it->second);
    }

    // Generate scenarios using GBM
    ScenarioGeneratorParams params(initial_rate, drift, volatility, min_rate, max_rate);
    *scenarios_ = ScenarioSet::generate(num_scenarios_, params, seed_);
}

PolicySet ProjectionEngine::parse_policy_buffer(const uint8_t* buffer, size_t size) {
    // Each policy is 32 bytes (due to alignment)
    const size_t policy_size = 32;

    if (size % policy_size != 0) {
        throw ExecutionError("Input buffer size is not a multiple of policy size (32 bytes)");
    }

    size_t num_policies = size / policy_size;
    PolicySet policies;

    for (size_t i = 0; i < num_policies; ++i) {
        const uint8_t* ptr = buffer + (i * policy_size);

        Policy policy;

        // Read fields (little-endian assumed)
        std::memcpy(&policy.policy_id, ptr, 8);
        ptr += 8;

        policy.age = *ptr;
        ptr += 1;

        policy.gender = static_cast<Gender>(*ptr);
        ptr += 1;

        // Skip 6 bytes padding
        ptr += 6;

        std::memcpy(&policy.sum_assured, ptr, 8);
        ptr += 8;

        std::memcpy(&policy.premium, ptr, 8);
        ptr += 8;

        std::memcpy(&policy.term, ptr, 4);
        ptr += 4;

        std::memcpy(&policy.product_type, ptr, 4);
        ptr += 4;

        policies.add(policy);
    }

    return policies;
}

void ProjectionEngine::write_results_buffer(
    const ValuationResult& result,
    uint8_t* buffer,
    size_t size
) {
    // Output format: [scenario_id (u32), npv (f64), padding (4 bytes)]
    // Total: 16 bytes per scenario

    const size_t result_size = 16;
    size_t required_size = num_scenarios_ * result_size;

    if (size < required_size) {
        std::stringstream ss;
        ss << "Output buffer too small. Required: " << required_size << " bytes, provided: " << size << " bytes";
        throw ExecutionError(ss.str());
    }

    // For now, write summary statistics (not full distribution)
    // We'll write the mean NPV for all scenarios
    // In a real implementation, we'd write actual scenario results

    for (size_t i = 0; i < num_scenarios_; ++i) {
        uint8_t* ptr = buffer + (i * result_size);

        // scenario_id
        uint32_t scenario_id = static_cast<uint32_t>(i + 1);
        std::memcpy(ptr, &scenario_id, 4);
        ptr += 4;

        // npv (use mean for now, real implementation would have per-scenario values)
        double npv = result.mean_npv;
        std::memcpy(ptr, &npv, 8);
        ptr += 8;

        // padding (4 bytes, zeros)
        uint32_t padding = 0;
        std::memcpy(ptr, &padding, 4);
    }
}

} // namespace livecalc
