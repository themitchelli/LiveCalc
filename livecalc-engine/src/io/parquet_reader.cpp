#include "parquet_reader.hpp"
#include <stdexcept>

#ifdef HAVE_ARROW
#include <arrow/api.h>
#include <arrow/io/api.h>
#include <parquet/arrow/reader.h>
#include <parquet/arrow/schema.h>
#endif

namespace livecalc {

#ifdef HAVE_ARROW

PolicySet ParquetReader::load_policies(const std::string& filepath) {
    PolicySet ps;

    // Open Parquet file
    std::shared_ptr<arrow::io::ReadableFile> infile;
    auto status = arrow::io::ReadableFile::Open(filepath, arrow::default_memory_pool(), &infile);
    if (!status.ok()) {
        throw std::runtime_error("Cannot open Parquet file: " + filepath + " - " + status.ToString());
    }

    // Create Parquet reader
    std::unique_ptr<parquet::arrow::FileReader> arrow_reader;
    status = parquet::arrow::OpenFile(infile, arrow::default_memory_pool(), &arrow_reader);
    if (!status.ok()) {
        throw std::runtime_error("Cannot create Parquet reader: " + status.ToString());
    }

    // Read entire table into memory
    std::shared_ptr<arrow::Table> table;
    status = arrow_reader->ReadTable(&table);
    if (!status.ok()) {
        throw std::runtime_error("Cannot read Parquet table: " + status.ToString());
    }

    // Validate schema
    auto schema = table->schema();
    int policy_id_idx = schema->GetFieldIndex("policy_id");
    int age_idx = schema->GetFieldIndex("age");
    int gender_idx = schema->GetFieldIndex("gender");
    int sum_assured_idx = schema->GetFieldIndex("sum_assured");
    int premium_idx = schema->GetFieldIndex("premium");
    int term_idx = schema->GetFieldIndex("term");
    int product_type_idx = schema->GetFieldIndex("product_type");
    int underwriting_class_idx = schema->GetFieldIndex("underwriting_class");

    if (policy_id_idx < 0 || age_idx < 0 || gender_idx < 0 || sum_assured_idx < 0 ||
        premium_idx < 0 || term_idx < 0 || product_type_idx < 0 || underwriting_class_idx < 0) {
        throw std::runtime_error("Parquet file missing required columns. Expected: policy_id, age, gender, sum_assured, premium, term, product_type, underwriting_class");
    }

    // Extract columns
    auto policy_id_column = std::static_pointer_cast<arrow::UInt64Array>(table->column(policy_id_idx)->chunk(0));
    auto age_column = std::static_pointer_cast<arrow::UInt8Array>(table->column(age_idx)->chunk(0));
    auto gender_column = std::static_pointer_cast<arrow::UInt8Array>(table->column(gender_idx)->chunk(0));
    auto sum_assured_column = std::static_pointer_cast<arrow::DoubleArray>(table->column(sum_assured_idx)->chunk(0));
    auto premium_column = std::static_pointer_cast<arrow::DoubleArray>(table->column(premium_idx)->chunk(0));
    auto term_column = std::static_pointer_cast<arrow::UInt8Array>(table->column(term_idx)->chunk(0));
    auto product_type_column = std::static_pointer_cast<arrow::UInt8Array>(table->column(product_type_idx)->chunk(0));
    auto underwriting_class_column = std::static_pointer_cast<arrow::UInt8Array>(table->column(underwriting_class_idx)->chunk(0));

    // Reserve space for efficiency
    int64_t num_rows = table->num_rows();
    ps.reserve(static_cast<size_t>(num_rows));

    // Load policies row by row
    for (int64_t i = 0; i < num_rows; ++i) {
        Policy p;
        p.policy_id = policy_id_column->Value(i);
        p.age = age_column->Value(i);
        p.gender = static_cast<Gender>(gender_column->Value(i));
        p.sum_assured = sum_assured_column->Value(i);
        p.premium = premium_column->Value(i);
        p.term = term_column->Value(i);
        p.product_type = static_cast<ProductType>(product_type_column->Value(i));
        p.underwriting_class = static_cast<UnderwritingClass>(underwriting_class_column->Value(i));

        // Load additional columns as attributes
        for (int col_idx = 0; col_idx < schema->num_fields(); ++col_idx) {
            std::string col_name = schema->field(col_idx)->name();

            // Skip core fields
            if (col_name == "policy_id" || col_name == "age" || col_name == "gender" ||
                col_name == "sum_assured" || col_name == "premium" || col_name == "term" ||
                col_name == "product_type" || col_name == "underwriting_class") {
                continue;
            }

            // Store as string attribute (simplified - could be type-aware in future)
            auto column = table->column(col_idx)->chunk(0);
            if (column->type()->id() == arrow::Type::STRING) {
                auto string_array = std::static_pointer_cast<arrow::StringArray>(column);
                if (!string_array->IsNull(i)) {
                    p.attributes[col_name] = string_array->GetString(i);
                }
            }
        }

        ps.add(std::move(p));
    }

    return ps;
}

#else // !HAVE_ARROW

PolicySet ParquetReader::load_policies(const std::string& filepath) {
    (void)filepath;  // Suppress unused parameter warning
    throw std::runtime_error("Apache Arrow not available. Rebuild with -DHAVE_ARROW to enable Parquet support.");
}

#endif // HAVE_ARROW

} // namespace livecalc
