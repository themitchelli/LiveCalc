#include <catch2/catch_test_macros.hpp>
#include "../src/parquet_io.hpp"
#include "../src/buffer_manager.hpp"
#include <cstring>
#include <filesystem>

using namespace livecalc::orchestrator;

#ifdef HAVE_ARROW

// Helper to create test Parquet files using Arrow directly
#include <arrow/api.h>
#include <arrow/io/api.h>
#include <parquet/arrow/writer.h>

namespace {

void create_test_policy_parquet(const std::string& filepath, size_t num_records) {
    // Create builders
    arrow::UInt64Builder policy_id_builder;
    arrow::UInt8Builder age_builder;
    arrow::UInt8Builder gender_builder;
    arrow::DoubleBuilder sum_assured_builder;
    arrow::DoubleBuilder premium_builder;
    arrow::UInt32Builder term_builder;
    arrow::UInt8Builder product_type_builder;
    arrow::UInt8Builder underwriting_class_builder;

    // Reserve space
    policy_id_builder.Reserve(num_records);
    age_builder.Reserve(num_records);
    gender_builder.Reserve(num_records);
    sum_assured_builder.Reserve(num_records);
    premium_builder.Reserve(num_records);
    term_builder.Reserve(num_records);
    product_type_builder.Reserve(num_records);
    underwriting_class_builder.Reserve(num_records);

    // Populate with test data
    for (size_t i = 0; i < num_records; ++i) {
        policy_id_builder.UnsafeAppend(1000 + i);
        age_builder.UnsafeAppend(30 + (i % 40));
        gender_builder.UnsafeAppend(i % 2);
        sum_assured_builder.UnsafeAppend(100000.0 + i * 1000);
        premium_builder.UnsafeAppend(1000.0 + i * 10);
        term_builder.UnsafeAppend(10 + (i % 20));
        product_type_builder.UnsafeAppend(i % 3);
        underwriting_class_builder.UnsafeAppend(i % 5);
    }

    // Finalize arrays
    std::shared_ptr<arrow::Array> policy_id_array, age_array, gender_array;
    std::shared_ptr<arrow::Array> sum_assured_array, premium_array, term_array;
    std::shared_ptr<arrow::Array> product_type_array, underwriting_class_array;

    policy_id_builder.Finish(&policy_id_array);
    age_builder.Finish(&age_array);
    gender_builder.Finish(&gender_array);
    sum_assured_builder.Finish(&sum_assured_array);
    premium_builder.Finish(&premium_array);
    term_builder.Finish(&term_array);
    product_type_builder.Finish(&product_type_array);
    underwriting_class_builder.Finish(&underwriting_class_array);

    // Create schema
    auto schema = arrow::schema({
        arrow::field("policy_id", arrow::uint64()),
        arrow::field("age", arrow::uint8()),
        arrow::field("gender", arrow::uint8()),
        arrow::field("sum_assured", arrow::float64()),
        arrow::field("premium", arrow::float64()),
        arrow::field("term", arrow::uint32()),
        arrow::field("product_type", arrow::uint8()),
        arrow::field("underwriting_class", arrow::uint8())
    });

    // Create table
    auto table = arrow::Table::Make(schema, {
        policy_id_array, age_array, gender_array, sum_assured_array,
        premium_array, term_array, product_type_array, underwriting_class_array
    });

    // Write to file
    std::shared_ptr<arrow::io::FileOutputStream> outfile;
    ARROW_ASSIGN_OR_RAISE(outfile, arrow::io::FileOutputStream::Open(filepath));
    PARQUET_THROW_NOT_OK(parquet::arrow::WriteTable(*table, arrow::default_memory_pool(), outfile, 1024*1024));
}

void create_test_scenario_parquet(const std::string& filepath, size_t num_records) {
    arrow::UInt32Builder scenario_id_builder;
    arrow::UInt32Builder year_builder;
    arrow::DoubleBuilder rate_builder;

    scenario_id_builder.Reserve(num_records);
    year_builder.Reserve(num_records);
    rate_builder.Reserve(num_records);

    for (size_t i = 0; i < num_records; ++i) {
        scenario_id_builder.UnsafeAppend(i / 50);  // 50 years per scenario
        year_builder.UnsafeAppend(1 + (i % 50));
        rate_builder.UnsafeAppend(0.03 + (i % 100) * 0.0001);
    }

    std::shared_ptr<arrow::Array> scenario_id_array, year_array, rate_array;
    scenario_id_builder.Finish(&scenario_id_array);
    year_builder.Finish(&year_array);
    rate_builder.Finish(&rate_array);

    auto schema = arrow::schema({
        arrow::field("scenario_id", arrow::uint32()),
        arrow::field("year", arrow::uint32()),
        arrow::field("rate", arrow::float64())
    });

    auto table = arrow::Table::Make(schema, {scenario_id_array, year_array, rate_array});

    std::shared_ptr<arrow::io::FileOutputStream> outfile;
    ARROW_ASSIGN_OR_RAISE(outfile, arrow::io::FileOutputStream::Open(filepath));
    PARQUET_THROW_NOT_OK(parquet::arrow::WriteTable(*table, arrow::default_memory_pool(), outfile, 1024*1024));
}

} // anonymous namespace

TEST_CASE("ParquetSchema validation", "[parquet][schema]") {
    ParquetSchema schema;
    schema.name = "Test";
    schema.required_columns = {"col1", "col2", "col3"};
    schema.optional_columns = {"col4"};

    SECTION("Valid schema with all required columns") {
        std::vector<std::string> actual = {"col1", "col2", "col3"};
        std::string error;
        REQUIRE(schema.validate_columns(actual, error));
        REQUIRE(error.empty());
    }

    SECTION("Valid schema with required + optional") {
        std::vector<std::string> actual = {"col1", "col2", "col3", "col4"};
        std::string error;
        REQUIRE(schema.validate_columns(actual, error));
    }

    SECTION("Missing required column") {
        std::vector<std::string> actual = {"col1", "col3"};  // missing col2
        std::string error;
        REQUIRE_FALSE(schema.validate_columns(actual, error));
        REQUIRE(error.find("col2") != std::string::npos);
    }

    SECTION("Extra columns allowed") {
        std::vector<std::string> actual = {"col1", "col2", "col3", "extra"};
        std::string error;
        REQUIRE(schema.validate_columns(actual, error));
    }
}

TEST_CASE("ParquetReader - Policy schema", "[parquet][reader][schema]") {
    auto schema = ParquetReader::get_policy_schema();

    REQUIRE(schema.name == "Policy");
    REQUIRE(schema.required_columns.size() == 8);
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "policy_id") != schema.required_columns.end());
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "age") != schema.required_columns.end());
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "gender") != schema.required_columns.end());
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "sum_assured") != schema.required_columns.end());
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "premium") != schema.required_columns.end());
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "term") != schema.required_columns.end());
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "product_type") != schema.required_columns.end());
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "underwriting_class") != schema.required_columns.end());
}

TEST_CASE("ParquetReader - Scenario schema", "[parquet][reader][schema]") {
    auto schema = ParquetReader::get_scenario_schema();

    REQUIRE(schema.name == "Scenario");
    REQUIRE(schema.required_columns.size() == 3);
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "scenario_id") != schema.required_columns.end());
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "year") != schema.required_columns.end());
    REQUIRE(std::find(schema.required_columns.begin(), schema.required_columns.end(), "rate") != schema.required_columns.end());
}

TEST_CASE("ParquetReader - Get row count", "[parquet][reader]") {
    const std::string test_file = "/tmp/test_policies_count.parquet";
    create_test_policy_parquet(test_file, 100);

    ParquetReader reader;
    size_t row_count = reader.get_row_count(test_file);

    REQUIRE(row_count == 100);
    REQUIRE(reader.get_last_error().empty());

    std::filesystem::remove(test_file);
}

TEST_CASE("ParquetReader - Read policies", "[parquet][reader]") {
    const std::string test_file = "/tmp/test_policies.parquet";
    create_test_policy_parquet(test_file, 50);

    BufferManager mgr;
    auto result = mgr.allocate_buffer(BufferType::INPUT, 50);
    REQUIRE(result.success);

    ParquetReader reader;
    size_t records_read = 0;
    bool success = reader.read_policies(test_file, result.buffer_input, 50, records_read);

    REQUIRE(success);
    REQUIRE(records_read == 50);
    REQUIRE(reader.get_last_error().empty());

    // Verify data
    REQUIRE(result.buffer_input[0].policy_id == 1000);
    REQUIRE(result.buffer_input[0].age == 30);
    REQUIRE(result.buffer_input[0].gender == 0);
    REQUIRE(result.buffer_input[0].sum_assured == 100000.0);
    REQUIRE(result.buffer_input[0].premium == 1000.0);
    REQUIRE(result.buffer_input[0].term == 10);
    REQUIRE(result.buffer_input[0].product_type == 0);
    REQUIRE(result.buffer_input[0].underwriting_class == 0);

    REQUIRE(result.buffer_input[49].policy_id == 1049);
    REQUIRE(result.buffer_input[49].age == 30 + 49);

    mgr.free_buffer("input");
    std::filesystem::remove(test_file);
}

TEST_CASE("ParquetReader - Read scenarios", "[parquet][reader]") {
    const std::string test_file = "/tmp/test_scenarios.parquet";
    create_test_scenario_parquet(test_file, 500);  // 10 scenarios × 50 years

    BufferManager mgr;
    auto result = mgr.allocate_buffer(BufferType::SCENARIO, 500);
    REQUIRE(result.success);

    ParquetReader reader;
    size_t records_read = 0;
    bool success = reader.read_scenarios(test_file, result.buffer_scenario, 500, records_read);

    REQUIRE(success);
    REQUIRE(records_read == 500);

    // Verify data
    REQUIRE(result.buffer_scenario[0].scenario_id == 0);
    REQUIRE(result.buffer_scenario[0].year == 1);
    REQUIRE(result.buffer_scenario[0].rate >= 0.03);
    REQUIRE(result.buffer_scenario[0].rate <= 0.04);

    REQUIRE(result.buffer_scenario[49].scenario_id == 0);
    REQUIRE(result.buffer_scenario[49].year == 50);

    REQUIRE(result.buffer_scenario[50].scenario_id == 1);
    REQUIRE(result.buffer_scenario[50].year == 1);

    mgr.free_buffer("scenario");
    std::filesystem::remove(test_file);
}

TEST_CASE("ParquetReader - File not found", "[parquet][reader][error]") {
    BufferManager mgr;
    auto result = mgr.allocate_buffer(BufferType::INPUT, 10);
    REQUIRE(result.success);

    ParquetReader reader;
    size_t records_read = 0;
    bool success = reader.read_policies("/tmp/nonexistent.parquet", result.buffer_input, 10, records_read);

    REQUIRE_FALSE(success);
    REQUIRE(records_read == 0);
    REQUIRE(!reader.get_last_error().empty());
    REQUIRE(reader.get_last_error().find("not found") != std::string::npos);

    mgr.free_buffer("input");
}

TEST_CASE("ParquetReader - Large dataset (1M rows)", "[parquet][reader][benchmark]") {
    const std::string test_file = "/tmp/test_policies_1m.parquet";
    const size_t num_records = 1000000;

    // Create large test file
    create_test_policy_parquet(test_file, num_records);

    BufferManager mgr;
    auto result = mgr.allocate_buffer(BufferType::INPUT, num_records);
    REQUIRE(result.success);

    ParquetReader reader;
    size_t records_read = 0;

    auto start = std::chrono::high_resolution_clock::now();
    bool success = reader.read_policies(test_file, result.buffer_input, num_records, records_read);
    auto end = std::chrono::high_resolution_clock::now();
    auto duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

    REQUIRE(success);
    REQUIRE(records_read == num_records);
    REQUIRE(duration_ms < 10000);  // Should complete in <10 seconds

    mgr.free_buffer("input");
    std::filesystem::remove(test_file);
}

TEST_CASE("ParquetWriter - Write results", "[parquet][writer]") {
    const std::string test_file = "/tmp/test_results.parquet";

    // Create test data
    BufferManager mgr;
    auto result = mgr.allocate_buffer(BufferType::RESULT, 100);
    REQUIRE(result.success);

    for (size_t i = 0; i < 100; ++i) {
        result.buffer_result[i].scenario_id = i / 10;
        result.buffer_result[i].policy_id = 1000 + i;
        result.buffer_result[i].npv = 50000.0 + i * 100;
        result.buffer_result[i].premium_income = 10000.0 + i * 10;
        result.buffer_result[i].death_benefits = 5000.0 + i * 5;
        result.buffer_result[i].surrender_benefits = 1000.0 + i;
        result.buffer_result[i].expenses = 500.0 + i * 0.5;
        result.buffer_result[i].execution_time_ms = 10.0 + i * 0.1;
    }

    // Write to Parquet
    ParquetWriter writer;
    bool success = writer.write_results(test_file, result.buffer_result, 100);

    REQUIRE(success);
    REQUIRE(writer.get_last_error().empty());

    // Verify file exists and has correct row count
    ParquetReader reader;
    size_t row_count = reader.get_row_count(test_file);
    REQUIRE(row_count == 100);

    mgr.free_buffer("result");
    std::filesystem::remove(test_file);
}

TEST_CASE("ParquetWriter - Large dataset (1M rows)", "[parquet][writer][benchmark]") {
    const std::string test_file = "/tmp/test_results_1m.parquet";
    const size_t num_records = 1000000;

    BufferManager mgr;
    auto result = mgr.allocate_buffer(BufferType::RESULT, num_records);
    REQUIRE(result.success);

    // Populate test data
    for (size_t i = 0; i < num_records; ++i) {
        result.buffer_result[i].scenario_id = i / 1000;
        result.buffer_result[i].policy_id = i;
        result.buffer_result[i].npv = 50000.0 + i;
        result.buffer_result[i].premium_income = 10000.0;
        result.buffer_result[i].death_benefits = 5000.0;
        result.buffer_result[i].surrender_benefits = 1000.0;
        result.buffer_result[i].expenses = 500.0;
        result.buffer_result[i].execution_time_ms = 10.0;
    }

    ParquetWriter writer;
    auto start = std::chrono::high_resolution_clock::now();
    bool success = writer.write_results(test_file, result.buffer_result, num_records);
    auto end = std::chrono::high_resolution_clock::now();
    auto duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

    REQUIRE(success);
    REQUIRE(duration_ms < 10000);  // Should complete in <10 seconds

    mgr.free_buffer("result");
    std::filesystem::remove(test_file);
}

TEST_CASE("Round-trip: Write and read back", "[parquet][integration]") {
    const std::string test_file = "/tmp/test_roundtrip.parquet";

    // Create and write results
    BufferManager mgr;
    auto write_result = mgr.allocate_buffer(BufferType::RESULT, 50);
    REQUIRE(write_result.success);

    for (size_t i = 0; i < 50; ++i) {
        write_result.buffer_result[i].scenario_id = i;
        write_result.buffer_result[i].policy_id = 2000 + i;
        write_result.buffer_result[i].npv = 60000.0 + i * 100;
        write_result.buffer_result[i].premium_income = 12000.0;
        write_result.buffer_result[i].death_benefits = 6000.0;
        write_result.buffer_result[i].surrender_benefits = 1200.0;
        write_result.buffer_result[i].expenses = 600.0;
        write_result.buffer_result[i].execution_time_ms = 15.0;
    }

    ParquetWriter writer;
    REQUIRE(writer.write_results(test_file, write_result.buffer_result, 50));

    // Read back and verify (not directly possible since we don't have a read_results method)
    // But we can verify the file exists and has correct row count
    ParquetReader reader;
    size_t row_count = reader.get_row_count(test_file);
    REQUIRE(row_count == 50);

    mgr.free_buffer("result");
    std::filesystem::remove(test_file);
}

#else

TEST_CASE("Parquet support not available", "[parquet][skip]") {
    WARN("Parquet tests skipped - Arrow library not available");
    REQUIRE(true);  // Mark as passing so build doesn't fail
}

#endif
