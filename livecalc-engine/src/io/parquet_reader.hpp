#ifndef LIVECALC_PARQUET_READER_HPP
#define LIVECALC_PARQUET_READER_HPP

#include "../policy.hpp"
#include <string>
#include <memory>

namespace livecalc {

class ParquetReader {
public:
    /**
     * Load policies from a Parquet file.
     *
     * Expected schema:
     *   - policy_id: uint64
     *   - age: uint8
     *   - gender: uint8 (0=Male, 1=Female)
     *   - sum_assured: float64
     *   - premium: float64
     *   - term: uint8
     *   - product_type: uint8 (0=Term, 1=WholeLife, 2=Endowment)
     *   - underwriting_class: uint8 (0=Standard, 1=Smoker, 2=NonSmoker, 3=Preferred, 4=Substandard)
     *   - Additional columns are stored in attributes map
     *
     * @param filepath Path to Parquet file
     * @return PolicySet containing loaded policies
     * @throws std::runtime_error if file cannot be read or schema is invalid
     */
    static PolicySet load_policies(const std::string& filepath);

private:
    // Apache Arrow implementation details
    struct Impl;
};

} // namespace livecalc

#endif // LIVECALC_PARQUET_READER_HPP
