#ifndef LIVECALC_ORCHESTRATOR_PARQUET_IO_HPP
#define LIVECALC_ORCHESTRATOR_PARQUET_IO_HPP

#include <string>
#include <vector>
#include <cstdint>
#include "buffer_manager.hpp"

namespace livecalc {
namespace orchestrator {

/**
 * ParquetSchema - Defines expected structure of Parquet files
 */
struct ParquetSchema {
    std::string name;
    std::vector<std::string> required_columns;
    std::vector<std::string> optional_columns;

    bool validate_columns(const std::vector<std::string>& actual_columns,
                          std::string& error_message) const;
};

/**
 * ParquetReader - Reads data from Parquet files into SharedArrayBuffers
 *
 * Supports:
 * - Policy data: loads into InputBuffer
 * - Scenario data: loads into ScenarioBuffer
 * - Schema validation to ensure columns match expected layout
 */
class ParquetReader {
public:
    ParquetReader() = default;
    ~ParquetReader() = default;

    // Prevent copying
    ParquetReader(const ParquetReader&) = delete;
    ParquetReader& operator=(const ParquetReader&) = delete;

    /**
     * Read policies from Parquet file into InputBuffer
     *
     * Expected columns:
     * - policy_id (uint64)
     * - age (uint8)
     * - gender (uint8)
     * - sum_assured (double)
     * - premium (double)
     * - term (uint32)
     * - product_type (uint8)
     * - underwriting_class (uint8)
     *
     * @param filepath Path to Parquet file
     * @param buffer Pointer to InputBuffer (must be pre-allocated with sufficient size)
     * @param max_records Maximum number of records to read
     * @param records_read Output: actual number of records read
     * @return true on success, false on error
     */
    bool read_policies(const std::string& filepath,
                      InputBufferRecord* buffer,
                      size_t max_records,
                      size_t& records_read);

    /**
     * Read scenarios from Parquet file into ScenarioBuffer
     *
     * Expected columns:
     * - scenario_id (uint32)
     * - year (uint32)
     * - rate (double)
     *
     * @param filepath Path to Parquet file
     * @param buffer Pointer to ScenarioBuffer
     * @param max_records Maximum number of records to read
     * @param records_read Output: actual number of records read
     * @return true on success, false on error
     */
    bool read_scenarios(const std::string& filepath,
                       ScenarioBufferRecord* buffer,
                       size_t max_records,
                       size_t& records_read);

    /**
     * Get row count from Parquet file without loading data
     */
    size_t get_row_count(const std::string& filepath);

    /**
     * Get last error message
     */
    const std::string& get_last_error() const { return last_error_; }

    /**
     * Get policy schema for validation
     */
    static ParquetSchema get_policy_schema();

    /**
     * Get scenario schema for validation
     */
    static ParquetSchema get_scenario_schema();

private:
    std::string last_error_;

    bool validate_file_exists(const std::string& filepath);
    void set_error(const std::string& error);
};

/**
 * ParquetWriter - Writes data from SharedArrayBuffers to Parquet files
 *
 * Supports:
 * - Result data: writes from ResultBuffer
 */
class ParquetWriter {
public:
    ParquetWriter() = default;
    ~ParquetWriter() = default;

    // Prevent copying
    ParquetWriter(const ParquetWriter&) = delete;
    ParquetWriter& operator=(const ParquetWriter&) = delete;

    /**
     * Write results from ResultBuffer to Parquet file
     *
     * Columns written:
     * - scenario_id (uint32)
     * - policy_id (uint64)
     * - npv (double)
     * - premium_income (double)
     * - death_benefits (double)
     * - surrender_benefits (double)
     * - expenses (double)
     * - execution_time_ms (double)
     *
     * @param filepath Path to output Parquet file
     * @param buffer Pointer to ResultBuffer
     * @param num_records Number of records to write
     * @return true on success, false on error
     */
    bool write_results(const std::string& filepath,
                      const ResultBufferRecord* buffer,
                      size_t num_records);

    /**
     * Get last error message
     */
    const std::string& get_last_error() const { return last_error_; }

private:
    std::string last_error_;

    void set_error(const std::string& error);
};

} // namespace orchestrator
} // namespace livecalc

#endif // LIVECALC_ORCHESTRATOR_PARQUET_IO_HPP
