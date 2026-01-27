#include "parquet_writer.hpp"
#include <stdexcept>

#ifdef HAVE_ARROW
#include <arrow/api.h>
#include <arrow/io/api.h>
#include <parquet/arrow/writer.h>
#endif

namespace livecalc {

#ifdef HAVE_ARROW

void ParquetWriter::write_results(const ValuationResult& result, const std::string& filepath) {
    // Check if we have scenario NPVs to write
    if (result.scenario_npvs.empty()) {
        throw std::runtime_error("ValuationResult has no scenario NPVs to write. Ensure ValuationConfig.store_scenario_npvs is true.");
    }

    // Build Arrow schema
    auto schema = arrow::schema({
        arrow::field("scenario_id", arrow::uint32()),
        arrow::field("npv", arrow::float64())
    });

    // Create builders for columns
    arrow::UInt32Builder scenario_id_builder;
    arrow::DoubleBuilder npv_builder;

    // Reserve capacity
    auto status = scenario_id_builder.Reserve(result.scenario_npvs.size());
    if (!status.ok()) {
        throw std::runtime_error("Failed to reserve memory for scenario_id column: " + status.ToString());
    }
    status = npv_builder.Reserve(result.scenario_npvs.size());
    if (!status.ok()) {
        throw std::runtime_error("Failed to reserve memory for npv column: " + status.ToString());
    }

    // Append data
    for (size_t i = 0; i < result.scenario_npvs.size(); ++i) {
        status = scenario_id_builder.Append(static_cast<uint32_t>(i));
        if (!status.ok()) {
            throw std::runtime_error("Failed to append scenario_id: " + status.ToString());
        }
        status = npv_builder.Append(result.scenario_npvs[i]);
        if (!status.ok()) {
            throw std::runtime_error("Failed to append npv: " + status.ToString());
        }
    }

    // Finish building arrays
    std::shared_ptr<arrow::Array> scenario_id_array;
    status = scenario_id_builder.Finish(&scenario_id_array);
    if (!status.ok()) {
        throw std::runtime_error("Failed to finish scenario_id array: " + status.ToString());
    }

    std::shared_ptr<arrow::Array> npv_array;
    status = npv_builder.Finish(&npv_array);
    if (!status.ok()) {
        throw std::runtime_error("Failed to finish npv array: " + status.ToString());
    }

    // Create Arrow table
    auto table = arrow::Table::Make(schema, {scenario_id_array, npv_array});

    // Open output file
    std::shared_ptr<arrow::io::FileOutputStream> outfile;
    status = arrow::io::FileOutputStream::Open(filepath, &outfile);
    if (!status.ok()) {
        throw std::runtime_error("Cannot open Parquet file for writing: " + filepath + " - " + status.ToString());
    }

    // Write Parquet file
    status = parquet::arrow::WriteTable(*table, arrow::default_memory_pool(), outfile, 1024 * 1024); // 1MB row group size
    if (!status.ok()) {
        throw std::runtime_error("Failed to write Parquet table: " + status.ToString());
    }

    // Close file
    status = outfile->Close();
    if (!status.ok()) {
        throw std::runtime_error("Failed to close Parquet file: " + status.ToString());
    }
}

#else // !HAVE_ARROW

void ParquetWriter::write_results(const ValuationResult& /* result */, const std::string& /* filepath */) {
    throw std::runtime_error("Apache Arrow not available. Rebuild with -DHAVE_ARROW to enable Parquet support.");
}

#endif // HAVE_ARROW

} // namespace livecalc
