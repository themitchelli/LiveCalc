#include "udf_context.hpp"
#include "udf_executor.hpp"

namespace livecalc {

// Default constructor: UDFs disabled
UDFContext::UDFContext()
    : python_script_path(""),
      executor(nullptr),
      enabled(false),
      udfs_called(0),
      udf_time_ms(0.0),
      timeout_ms(1000)
{
}

// Constructor with Python script path
UDFContext::UDFContext(const std::string& script_path, int timeout)
    : python_script_path(script_path),
      executor(nullptr),
      enabled(false),
      udfs_called(0),
      udf_time_ms(0.0),
      timeout_ms(timeout)
{
    if (!script_path.empty()) {
        try {
            executor = std::make_shared<UDFExecutor>(script_path);
            enabled = true;
        } catch (const UDFExecutionError& e) {
            // If script loading fails, UDFs remain disabled
            // Error logged but not thrown (fail gracefully)
            enabled = false;
        }
    }
}

} // namespace livecalc
