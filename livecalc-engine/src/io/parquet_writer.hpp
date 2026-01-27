#ifndef LIVECALC_PARQUET_WRITER_HPP
#define LIVECALC_PARQUET_WRITER_HPP

#include "../valuation.hpp"
#include <string>

namespace livecalc {

class ParquetWriter {
public:
    /**
     * Write valuation results to a Parquet file.
     *
     * Output schema:
     *   - scenario_id: uint32 (0-indexed)
     *   - npv: float64 (total NPV for this scenario)
     *
     * @param result ValuationResult containing scenario NPVs
     * @param filepath Path to output Parquet file
     * @throws std::runtime_error if file cannot be written
     */
    static void write_results(const ValuationResult& result, const std::string& filepath);

private:
    // Apache Arrow implementation details
    struct Impl;
};

} // namespace livecalc

#endif // LIVECALC_PARQUET_WRITER_HPP
