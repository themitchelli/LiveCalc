#ifndef LIVECALC_IO_JSON_WRITER_HPP
#define LIVECALC_IO_JSON_WRITER_HPP

#include <ostream>
#include <string>
#include "../valuation.hpp"

namespace livecalc {
namespace io {

// Write ValuationResult to JSON format
// The output includes statistics, execution time, and optionally the full distribution
void write_valuation_result_json(std::ostream& os, const ValuationResult& result,
                                  bool pretty_print = true);

// Write ValuationResult to JSON file
void write_valuation_result_json(const std::string& filepath, const ValuationResult& result,
                                  bool pretty_print = true);

} // namespace io
} // namespace livecalc

#endif // LIVECALC_IO_JSON_WRITER_HPP
