#include "json_writer.hpp"
#include <fstream>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace livecalc {
namespace io {

void write_valuation_result_json(std::ostream& os, const ValuationResult& result,
                                  bool pretty_print) {
    const std::string indent = pretty_print ? "  " : "";
    const std::string newline = pretty_print ? "\n" : "";
    const std::string space = pretty_print ? " " : "";

    os << std::fixed << std::setprecision(6);

    os << "{" << newline;

    // Statistics section
    os << indent << "\"statistics\":" << space << "{" << newline;
    os << indent << indent << "\"mean_npv\":" << space << result.mean_npv << "," << newline;
    os << indent << indent << "\"std_dev\":" << space << result.std_dev << "," << newline;
    os << indent << indent << "\"percentiles\":" << space << "{" << newline;
    os << indent << indent << indent << "\"p50\":" << space << result.p50() << "," << newline;
    os << indent << indent << indent << "\"p75\":" << space << result.p75() << "," << newline;
    os << indent << indent << indent << "\"p90\":" << space << result.p90() << "," << newline;
    os << indent << indent << indent << "\"p95\":" << space << result.p95() << "," << newline;
    os << indent << indent << indent << "\"p99\":" << space << result.p99() << newline;
    os << indent << indent << "}," << newline;
    os << indent << indent << "\"cte_95\":" << space << result.cte_95 << newline;
    os << indent << "}," << newline;

    // Execution metrics
    os << indent << "\"execution_time_ms\":" << space << std::fixed << std::setprecision(2)
       << result.execution_time_ms << "," << newline;

    // Scenario count
    os << indent << "\"scenario_count\":" << space << result.scenario_npvs.size() << "," << newline;

    // Distribution (scenario NPVs)
    os << std::fixed << std::setprecision(6);
    os << indent << "\"distribution\":" << space << "[";
    if (!result.scenario_npvs.empty()) {
        if (pretty_print) {
            os << newline << indent << indent;
        }
        for (size_t i = 0; i < result.scenario_npvs.size(); ++i) {
            if (i > 0) {
                os << ",";
                if (pretty_print && i % 10 == 0) {
                    os << newline << indent << indent;
                } else {
                    os << space;
                }
            }
            os << result.scenario_npvs[i];
        }
        if (pretty_print) {
            os << newline << indent;
        }
    }
    os << "]" << newline;

    os << "}" << newline;
}

void write_valuation_result_json(const std::string& filepath, const ValuationResult& result,
                                  bool pretty_print) {
    std::ofstream file(filepath);
    if (!file) {
        throw std::runtime_error("Failed to open output file: " + filepath);
    }
    write_valuation_result_json(file, result, pretty_print);
}

} // namespace io
} // namespace livecalc
