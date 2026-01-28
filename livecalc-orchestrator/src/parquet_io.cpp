#include "parquet_io.hpp"
#include <algorithm>
#include <fstream>
#include <sstream>

#ifdef HAVE_ARROW
#include <arrow/api.h>
#include <arrow/io/api.h>
#include <parquet/arrow/reader.h>
#include <parquet/arrow/writer.h>
#include <parquet/exception.h>
#endif

namespace livecalc {
namespace orchestrator {

// ============================================================================
// ParquetSchema implementation
// ============================================================================

bool ParquetSchema::validate_columns(const std::vector<std::string>& actual_columns,
                                    std::string& error_message) const {
    // Check all required columns are present
    for (const auto& required : required_columns) {
        if (std::find(actual_columns.begin(), actual_columns.end(), required) == actual_columns.end()) {
            std::ostringstream oss;
            oss << "Missing required column '" << required << "' in " << name;
            error_message = oss.str();
            return false;
        }
    }
    return true;
}

// ============================================================================
// ParquetReader implementation
// ============================================================================

ParquetSchema ParquetReader::get_policy_schema() {
    ParquetSchema schema;
    schema.name = "Policy";
    schema.required_columns = {
        "policy_id", "age", "gender", "sum_assured",
        "premium", "term", "product_type", "underwriting_class"
    };
    schema.optional_columns = {}; // All columns are required for now
    return schema;
}

ParquetSchema ParquetReader::get_scenario_schema() {
    ParquetSchema schema;
    schema.name = "Scenario";
    schema.required_columns = {"scenario_id", "year", "rate"};
    schema.optional_columns = {};
    return schema;
}

bool ParquetReader::validate_file_exists(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file.good()) {
        set_error("File not found: " + filepath);
        return false;
    }
    return true;
}

void ParquetReader::set_error(const std::string& error) {
    last_error_ = error;
}

size_t ParquetReader::get_row_count([[maybe_unused]] const std::string& filepath) {
#ifdef HAVE_ARROW
    if (!validate_file_exists(filepath)) {
        return 0;
    }

    try {
        auto file_reader = parquet::ParquetFileReader::OpenFile(filepath);
        auto metadata = file_reader->metadata();
        return metadata->num_rows();
    } catch (const std::exception& e) {
        set_error(std::string("Failed to read row count: ") + e.what());
        return 0;
    }
#else
    set_error("Parquet support not available (Arrow library not linked)");
    return 0;
#endif
}

bool ParquetReader::read_policies([[maybe_unused]] const std::string& filepath,
                                 [[maybe_unused]] InputBufferRecord* buffer,
                                 [[maybe_unused]] size_t max_records,
                                 [[maybe_unused]] size_t& records_read) {
#ifdef HAVE_ARROW
    if (!validate_file_exists(filepath)) {
        return false;
    }

    try {
        // Open Parquet file
        std::shared_ptr<arrow::io::ReadableFile> infile;
        ARROW_ASSIGN_OR_RAISE(infile, arrow::io::ReadableFile::Open(filepath));

        // Create Parquet reader
        std::unique_ptr<parquet::arrow::FileReader> arrow_reader;
        auto status = parquet::arrow::OpenFile(infile, arrow::default_memory_pool(), &arrow_reader);
        if (!status.ok()) {
            set_error("Failed to open Parquet file: " + status.ToString());
            return false;
        }

        // Read table
        std::shared_ptr<arrow::Table> table;
        status = arrow_reader->ReadTable(&table);
        if (!status.ok()) {
            set_error("Failed to read table: " + status.ToString());
            return false;
        }

        // Validate schema
        auto schema = get_policy_schema();
        std::vector<std::string> column_names;
        for (const auto& field : table->schema()->fields()) {
            column_names.push_back(field->name());
        }

        std::string validation_error;
        if (!schema.validate_columns(column_names, validation_error)) {
            set_error(validation_error);
            return false;
        }

        // Get row count
        int64_t num_rows = table->num_rows();
        records_read = std::min(static_cast<size_t>(num_rows), max_records);

        // Extract columns
        auto policy_id_col = std::static_pointer_cast<arrow::UInt64Array>(
            table->GetColumnByName("policy_id")->chunk(0));
        auto age_col = std::static_pointer_cast<arrow::UInt8Array>(
            table->GetColumnByName("age")->chunk(0));
        auto gender_col = std::static_pointer_cast<arrow::UInt8Array>(
            table->GetColumnByName("gender")->chunk(0));
        auto sum_assured_col = std::static_pointer_cast<arrow::DoubleArray>(
            table->GetColumnByName("sum_assured")->chunk(0));
        auto premium_col = std::static_pointer_cast<arrow::DoubleArray>(
            table->GetColumnByName("premium")->chunk(0));
        auto term_col = std::static_pointer_cast<arrow::UInt32Array>(
            table->GetColumnByName("term")->chunk(0));
        auto product_type_col = std::static_pointer_cast<arrow::UInt8Array>(
            table->GetColumnByName("product_type")->chunk(0));
        auto underwriting_class_col = std::static_pointer_cast<arrow::UInt8Array>(
            table->GetColumnByName("underwriting_class")->chunk(0));

        // Populate buffer
        for (size_t i = 0; i < records_read; ++i) {
            buffer[i].policy_id = policy_id_col->Value(i);
            buffer[i].age = age_col->Value(i);
            buffer[i].gender = gender_col->Value(i);
            buffer[i].sum_assured = sum_assured_col->Value(i);
            buffer[i].premium = premium_col->Value(i);
            buffer[i].term = term_col->Value(i);
            buffer[i].product_type = product_type_col->Value(i);
            buffer[i].underwriting_class = underwriting_class_col->Value(i);
        }

        return true;

    } catch (const std::exception& e) {
        set_error(std::string("Parquet read error: ") + e.what());
        return false;
    }
#else
    set_error("Parquet support not available (Arrow library not linked)");
    return false;
#endif
}

bool ParquetReader::read_scenarios([[maybe_unused]] const std::string& filepath,
                                   [[maybe_unused]] ScenarioBufferRecord* buffer,
                                   [[maybe_unused]] size_t max_records,
                                   [[maybe_unused]] size_t& records_read) {
#ifdef HAVE_ARROW
    if (!validate_file_exists(filepath)) {
        return false;
    }

    try {
        // Open Parquet file
        std::shared_ptr<arrow::io::ReadableFile> infile;
        ARROW_ASSIGN_OR_RAISE(infile, arrow::io::ReadableFile::Open(filepath));

        // Create Parquet reader
        std::unique_ptr<parquet::arrow::FileReader> arrow_reader;
        auto status = parquet::arrow::OpenFile(infile, arrow::default_memory_pool(), &arrow_reader);
        if (!status.ok()) {
            set_error("Failed to open Parquet file: " + status.ToString());
            return false;
        }

        // Read table
        std::shared_ptr<arrow::Table> table;
        status = arrow_reader->ReadTable(&table);
        if (!status.ok()) {
            set_error("Failed to read table: " + status.ToString());
            return false;
        }

        // Validate schema
        auto schema = get_scenario_schema();
        std::vector<std::string> column_names;
        for (const auto& field : table->schema()->fields()) {
            column_names.push_back(field->name());
        }

        std::string validation_error;
        if (!schema.validate_columns(column_names, validation_error)) {
            set_error(validation_error);
            return false;
        }

        // Get row count
        int64_t num_rows = table->num_rows();
        records_read = std::min(static_cast<size_t>(num_rows), max_records);

        // Extract columns
        auto scenario_id_col = std::static_pointer_cast<arrow::UInt32Array>(
            table->GetColumnByName("scenario_id")->chunk(0));
        auto year_col = std::static_pointer_cast<arrow::UInt32Array>(
            table->GetColumnByName("year")->chunk(0));
        auto rate_col = std::static_pointer_cast<arrow::DoubleArray>(
            table->GetColumnByName("rate")->chunk(0));

        // Populate buffer
        for (size_t i = 0; i < records_read; ++i) {
            buffer[i].scenario_id = scenario_id_col->Value(i);
            buffer[i].year = year_col->Value(i);
            buffer[i].rate = rate_col->Value(i);
        }

        return true;

    } catch (const std::exception& e) {
        set_error(std::string("Parquet read error: ") + e.what());
        return false;
    }
#else
    set_error("Parquet support not available (Arrow library not linked)");
    return false;
#endif
}

// ============================================================================
// ParquetWriter implementation
// ============================================================================

void ParquetWriter::set_error(const std::string& error) {
    last_error_ = error;
}

bool ParquetWriter::write_results([[maybe_unused]] const std::string& filepath,
                                  [[maybe_unused]] const ResultBufferRecord* buffer,
                                  [[maybe_unused]] size_t num_records) {
#ifdef HAVE_ARROW
    try {
        // Create Arrow builders for each column
        arrow::UInt32Builder scenario_id_builder;
        arrow::UInt64Builder policy_id_builder;
        arrow::DoubleBuilder npv_builder;
        arrow::DoubleBuilder premium_income_builder;
        arrow::DoubleBuilder death_benefits_builder;
        arrow::DoubleBuilder surrender_benefits_builder;
        arrow::DoubleBuilder expenses_builder;
        arrow::DoubleBuilder execution_time_ms_builder;

        // Reserve space for efficiency
        auto status = scenario_id_builder.Reserve(num_records);
        if (!status.ok()) {
            set_error("Failed to reserve space for scenario_id: " + status.ToString());
            return false;
        }
        policy_id_builder.Reserve(num_records);
        npv_builder.Reserve(num_records);
        premium_income_builder.Reserve(num_records);
        death_benefits_builder.Reserve(num_records);
        surrender_benefits_builder.Reserve(num_records);
        expenses_builder.Reserve(num_records);
        execution_time_ms_builder.Reserve(num_records);

        // Populate builders
        for (size_t i = 0; i < num_records; ++i) {
            scenario_id_builder.UnsafeAppend(buffer[i].scenario_id);
            policy_id_builder.UnsafeAppend(buffer[i].policy_id);
            npv_builder.UnsafeAppend(buffer[i].npv);
            premium_income_builder.UnsafeAppend(buffer[i].premium_income);
            death_benefits_builder.UnsafeAppend(buffer[i].death_benefits);
            surrender_benefits_builder.UnsafeAppend(buffer[i].surrender_benefits);
            expenses_builder.UnsafeAppend(buffer[i].expenses);
            execution_time_ms_builder.UnsafeAppend(buffer[i].execution_time_ms);
        }

        // Finalize arrays
        std::shared_ptr<arrow::Array> scenario_id_array;
        std::shared_ptr<arrow::Array> policy_id_array;
        std::shared_ptr<arrow::Array> npv_array;
        std::shared_ptr<arrow::Array> premium_income_array;
        std::shared_ptr<arrow::Array> death_benefits_array;
        std::shared_ptr<arrow::Array> surrender_benefits_array;
        std::shared_ptr<arrow::Array> expenses_array;
        std::shared_ptr<arrow::Array> execution_time_ms_array;

        scenario_id_builder.Finish(&scenario_id_array);
        policy_id_builder.Finish(&policy_id_array);
        npv_builder.Finish(&npv_array);
        premium_income_builder.Finish(&premium_income_array);
        death_benefits_builder.Finish(&death_benefits_array);
        surrender_benefits_builder.Finish(&surrender_benefits_array);
        expenses_builder.Finish(&expenses_array);
        execution_time_ms_builder.Finish(&execution_time_ms_array);

        // Create schema
        auto schema = arrow::schema({
            arrow::field("scenario_id", arrow::uint32()),
            arrow::field("policy_id", arrow::uint64()),
            arrow::field("npv", arrow::float64()),
            arrow::field("premium_income", arrow::float64()),
            arrow::field("death_benefits", arrow::float64()),
            arrow::field("surrender_benefits", arrow::float64()),
            arrow::field("expenses", arrow::float64()),
            arrow::field("execution_time_ms", arrow::float64())
        });

        // Create table
        auto table = arrow::Table::Make(schema, {
            scenario_id_array,
            policy_id_array,
            npv_array,
            premium_income_array,
            death_benefits_array,
            surrender_benefits_array,
            expenses_array,
            execution_time_ms_array
        });

        // Open output file
        std::shared_ptr<arrow::io::FileOutputStream> outfile;
        ARROW_ASSIGN_OR_RAISE(outfile, arrow::io::FileOutputStream::Open(filepath));

        // Write Parquet file
        status = parquet::arrow::WriteTable(
            *table,
            arrow::default_memory_pool(),
            outfile,
            1024 * 1024  // 1MB row group size
        );

        if (!status.ok()) {
            set_error("Failed to write Parquet file: " + status.ToString());
            return false;
        }

        return true;

    } catch (const std::exception& e) {
        set_error(std::string("Parquet write error: ") + e.what());
        return false;
    }
#else
    set_error("Parquet support not available (Arrow library not linked)");
    return false;
#endif
}

} // namespace orchestrator
} // namespace livecalc
