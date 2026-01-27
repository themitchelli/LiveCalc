#ifndef LIVECALC_UDF_CONTEXT_HPP
#define LIVECALC_UDF_CONTEXT_HPP

#include <string>
#include <memory>

namespace livecalc {

// Forward declaration
class UDFExecutor;

// Context for managing Python UDF execution during projection
// Handles: Python script loading, executor lifecycle, error tracking
struct UDFContext {
    std::string python_script_path;      // Path to Python script with UDF functions
    std::shared_ptr<UDFExecutor> executor; // Executor for calling Python functions
    bool enabled;                        // Whether UDFs are enabled (false if no script)

    // Metrics
    int udfs_called;                     // Total number of UDF calls made
    double udf_time_ms;                  // Total time spent in UDF execution (milliseconds)

    // Timeout configuration
    int timeout_ms;                      // Timeout for each UDF call (milliseconds)

    // Default constructor: UDFs disabled
    UDFContext();

    // Constructor with Python script path
    explicit UDFContext(const std::string& script_path, int timeout = 1000);

    // Disable copy (executor has state)
    UDFContext(const UDFContext&) = delete;
    UDFContext& operator=(const UDFContext&) = delete;

    // Enable move
    UDFContext(UDFContext&&) noexcept = default;
    UDFContext& operator=(UDFContext&&) noexcept = default;
};

} // namespace livecalc

#endif // LIVECALC_UDF_CONTEXT_HPP
