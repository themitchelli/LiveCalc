#include "../src/buffer_manager.hpp"
#include <catch2/catch_test_macros.hpp>
#include <cstring>
#include <vector>

using namespace livecalc::orchestrator;

TEST_CASE("BufferManager: Basic allocation and deallocation", "[buffer_manager]") {
    BufferManager manager;

    SECTION("Allocate INPUT buffer") {
        BufferInfo info = manager.allocate_buffer(BufferType::INPUT, "policies", 1000);

        REQUIRE(info.type == BufferType::INPUT);
        REQUIRE(info.name == "policies");
        REQUIRE(info.record_size == sizeof(InputBufferRecord));
        REQUIRE(info.num_records == 1000);
        REQUIRE(info.total_size == 1000 * sizeof(InputBufferRecord));
        REQUIRE(info.data != nullptr);
        REQUIRE(info.is_shared == true);

        // Verify 16-byte alignment
        REQUIRE(reinterpret_cast<uintptr_t>(info.data) % 16 == 0);
    }

    SECTION("Allocate SCENARIO buffer") {
        BufferInfo info = manager.allocate_buffer(BufferType::SCENARIO, "scenarios", 500000);

        REQUIRE(info.type == BufferType::SCENARIO);
        REQUIRE(info.record_size == sizeof(ScenarioBufferRecord));
        REQUIRE(info.num_records == 500000);
        REQUIRE(info.total_size == 500000 * sizeof(ScenarioBufferRecord));
    }

    SECTION("Allocate RESULT buffer") {
        BufferInfo info = manager.allocate_buffer(BufferType::RESULT, "results", 10000);

        REQUIRE(info.type == BufferType::RESULT);
        REQUIRE(info.record_size == sizeof(ResultBufferRecord));
        REQUIRE(info.num_records == 10000);
    }

    SECTION("Free specific buffer") {
        manager.allocate_buffer(BufferType::INPUT, "policies", 1000);
        REQUIRE(manager.has_buffer("policies") == true);

        manager.free_buffer("policies");
        REQUIRE(manager.has_buffer("policies") == false);
    }

    SECTION("Free all buffers") {
        manager.allocate_buffer(BufferType::INPUT, "policies", 1000);
        manager.allocate_buffer(BufferType::SCENARIO, "scenarios", 5000);
        manager.allocate_buffer(BufferType::RESULT, "results", 1000);

        REQUIRE(manager.get_total_allocated() > 0);

        manager.free_all();

        REQUIRE(manager.get_total_allocated() == 0);
        REQUIRE(manager.has_buffer("policies") == false);
        REQUIRE(manager.has_buffer("scenarios") == false);
        REQUIRE(manager.has_buffer("results") == false);
    }
}

TEST_CASE("BufferManager: Error handling", "[buffer_manager]") {
    BufferManager manager;

    SECTION("Cannot allocate buffer with 0 records") {
        REQUIRE_THROWS_AS(
            manager.allocate_buffer(BufferType::INPUT, "empty", 0),
            BufferError
        );
    }

    SECTION("Cannot allocate buffer with same name twice") {
        manager.allocate_buffer(BufferType::INPUT, "policies", 1000);

        REQUIRE_THROWS_AS(
            manager.allocate_buffer(BufferType::INPUT, "policies", 2000),
            BufferError
        );
    }

    SECTION("get_buffer throws if buffer not found") {
        REQUIRE_THROWS_AS(
            manager.get_buffer("nonexistent"),
            BufferNotFoundError
        );
    }

    SECTION("Buffer exceeds maximum records") {
        size_t max_input_records = BufferManager::get_max_records(BufferType::INPUT);

        REQUIRE_THROWS_AS(
            manager.allocate_buffer(BufferType::INPUT, "huge", max_input_records + 1),
            BufferOverflowError
        );
    }

    SECTION("validate_buffer_size throws if buffer too small") {
        manager.allocate_buffer(BufferType::INPUT, "policies", 100);
        size_t buffer_size = manager.get_buffer("policies").total_size;

        REQUIRE_THROWS_AS(
            manager.validate_buffer_size("policies", buffer_size + 1),
            BufferOverflowError
        );
    }
}

TEST_CASE("BufferManager: Buffer metadata and stats", "[buffer_manager]") {
    BufferManager manager;

    manager.allocate_buffer(BufferType::INPUT, "policies", 1000);
    manager.allocate_buffer(BufferType::SCENARIO, "scenarios", 50000);
    manager.allocate_buffer(BufferType::RESULT, "results", 1000);

    SECTION("has_buffer returns correct values") {
        REQUIRE(manager.has_buffer("policies") == true);
        REQUIRE(manager.has_buffer("scenarios") == true);
        REQUIRE(manager.has_buffer("results") == true);
        REQUIRE(manager.has_buffer("nonexistent") == false);
    }

    SECTION("get_buffer returns correct metadata") {
        BufferInfo info = manager.get_buffer("policies");
        REQUIRE(info.name == "policies");
        REQUIRE(info.type == BufferType::INPUT);
        REQUIRE(info.num_records == 1000);
    }

    SECTION("get_total_allocated sums all buffers") {
        size_t expected = 1000 * 32 +   // InputBufferRecord = 32 bytes
                         50000 * 16 +    // ScenarioBufferRecord = 16 bytes
                         1000 * 32;      // ResultBufferRecord = 32 bytes

        REQUIRE(manager.get_total_allocated() == expected);
    }

    SECTION("get_buffer_stats returns all buffers") {
        auto stats = manager.get_buffer_stats();

        REQUIRE(stats.size() == 3);
        REQUIRE(stats["policies"] == 1000 * 32);    // InputBufferRecord = 32 bytes
        REQUIRE(stats["scenarios"] == 50000 * 16);  // ScenarioBufferRecord = 16 bytes
        REQUIRE(stats["results"] == 1000 * 32);     // ResultBufferRecord = 32 bytes
    }
}

TEST_CASE("BufferManager: Buffer record structures", "[buffer_manager]") {
    SECTION("InputBufferRecord layout and alignment") {
        REQUIRE(sizeof(InputBufferRecord) == 32);
        REQUIRE(alignof(InputBufferRecord) == 16);

        // Verify field offsets
        REQUIRE(offsetof(InputBufferRecord, policy_id) == 0);
        REQUIRE(offsetof(InputBufferRecord, age) == 8);
        REQUIRE(offsetof(InputBufferRecord, gender) == 9);
        REQUIRE(offsetof(InputBufferRecord, underwriting_class) == 10);
        REQUIRE(offsetof(InputBufferRecord, product_type) == 11);
        REQUIRE(offsetof(InputBufferRecord, sum_assured) == 16);
        REQUIRE(offsetof(InputBufferRecord, premium) == 24);
    }

    SECTION("ScenarioBufferRecord layout and alignment") {
        REQUIRE(sizeof(ScenarioBufferRecord) == 16);
        REQUIRE(alignof(ScenarioBufferRecord) == 16);

        REQUIRE(offsetof(ScenarioBufferRecord, scenario_id) == 0);
        REQUIRE(offsetof(ScenarioBufferRecord, year) == 4);
        REQUIRE(offsetof(ScenarioBufferRecord, rate) == 8);
    }

    SECTION("ResultBufferRecord layout and alignment") {
        REQUIRE(sizeof(ResultBufferRecord) == 32);
        REQUIRE(alignof(ResultBufferRecord) == 16);

        REQUIRE(offsetof(ResultBufferRecord, scenario_id) == 0);
        REQUIRE(offsetof(ResultBufferRecord, policy_id) == 4);
        REQUIRE(offsetof(ResultBufferRecord, npv) == 8);
        REQUIRE(offsetof(ResultBufferRecord, padding1) == 16);
    }
}

TEST_CASE("BufferManager: Zero-copy data sharing", "[buffer_manager]") {
    BufferManager manager;

    SECTION("Write to buffer from one engine, read from another") {
        // Allocate scenario buffer (ESG output → Projection input)
        BufferInfo scenarios = manager.allocate_buffer(BufferType::SCENARIO, "scenarios", 10);

        // Simulate ESG writing scenarios
        auto* records = static_cast<ScenarioBufferRecord*>(scenarios.data);
        for (size_t i = 0; i < 10; ++i) {
            records[i].scenario_id = static_cast<uint32_t>(i + 1);
            records[i].year = 1;
            records[i].rate = 0.03 + i * 0.001;  // Rates: 0.030, 0.031, ..., 0.039
        }

        // Simulate Projection reading scenarios (zero-copy)
        BufferInfo read_scenarios = manager.get_buffer("scenarios");
        auto* read_records = static_cast<ScenarioBufferRecord*>(read_scenarios.data);

        // Verify data matches (no copying occurred)
        REQUIRE(read_records == records);  // Same pointer
        for (size_t i = 0; i < 10; ++i) {
            REQUIRE(read_records[i].scenario_id == i + 1);
            REQUIRE(read_records[i].year == 1);
            REQUIRE(read_records[i].rate == 0.03 + i * 0.001);
        }
    }

    SECTION("Buffer reuse across multiple runChunk calls") {
        BufferInfo input = manager.allocate_buffer(BufferType::INPUT, "policies", 100);

        // First write
        auto* records1 = static_cast<InputBufferRecord*>(input.data);
        records1[0].policy_id = 1;
        records1[0].sum_assured = 100000.0;

        // Get buffer again (should be same pointer)
        BufferInfo input2 = manager.get_buffer("policies");
        auto* records2 = static_cast<InputBufferRecord*>(input2.data);

        REQUIRE(records2 == records1);
        REQUIRE(records2[0].policy_id == 1);
        REQUIRE(records2[0].sum_assured == 100000.0);

        // Overwrite
        records2[0].policy_id = 2;
        records2[0].sum_assured = 200000.0;

        // Verify original pointer sees changes
        REQUIRE(records1[0].policy_id == 2);
        REQUIRE(records1[0].sum_assured == 200000.0);
    }
}

TEST_CASE("BufferManager: Large buffer allocation", "[buffer_manager]") {
    BufferManager manager;

    SECTION("Allocate 1M INPUT records (32 MB)") {
        BufferInfo info = manager.allocate_buffer(BufferType::INPUT, "large_policies", 1'000'000);

        REQUIRE(info.num_records == 1'000'000);
        REQUIRE(info.total_size == 1'000'000 * sizeof(InputBufferRecord));
        REQUIRE(info.data != nullptr);

        // Verify memory is zero-initialized
        auto* records = static_cast<InputBufferRecord*>(info.data);
        REQUIRE(records[0].policy_id == 0);
        REQUIRE(records[999'999].policy_id == 0);
    }

    SECTION("Allocate 10M SCENARIO records (160 MB)") {
        BufferInfo info = manager.allocate_buffer(BufferType::SCENARIO, "large_scenarios", 10'000'000);

        REQUIRE(info.num_records == 10'000'000);
        REQUIRE(info.total_size == 10'000'000 * sizeof(ScenarioBufferRecord));
    }

    SECTION("Total allocated tracks multiple large buffers") {
        manager.allocate_buffer(BufferType::INPUT, "policies", 1'000'000);
        manager.allocate_buffer(BufferType::SCENARIO, "scenarios", 10'000'000);

        size_t expected = 1'000'000 * 32 +    // InputBufferRecord = 32 bytes
                         10'000'000 * 16;     // ScenarioBufferRecord = 16 bytes

        REQUIRE(manager.get_total_allocated() == expected);
    }
}

TEST_CASE("BufferManager: Record size helpers", "[buffer_manager]") {
    SECTION("get_record_size returns correct sizes") {
        REQUIRE(BufferManager::get_record_size(BufferType::INPUT) == 32);
        REQUIRE(BufferManager::get_record_size(BufferType::SCENARIO) == 16);
        REQUIRE(BufferManager::get_record_size(BufferType::RESULT) == 32);
    }

    SECTION("get_max_records returns sensible limits") {
        // INPUT: 10M policies × 32 bytes = 320 MB
        REQUIRE(BufferManager::get_max_records(BufferType::INPUT) == 10'000'000);

        // SCENARIO: 100M rows × 16 bytes = 1.6 GB
        REQUIRE(BufferManager::get_max_records(BufferType::SCENARIO) == 100'000'000);

        // RESULT: 100M results × 32 bytes = 3.2 GB
        REQUIRE(BufferManager::get_max_records(BufferType::RESULT) == 100'000'000);
    }
}

TEST_CASE("BufferManager: validate_buffer_size", "[buffer_manager]") {
    BufferManager manager;
    manager.allocate_buffer(BufferType::INPUT, "policies", 1000);

    size_t buffer_size = manager.get_buffer("policies").total_size;

    SECTION("Validation passes when expected size fits") {
        REQUIRE_NOTHROW(manager.validate_buffer_size("policies", buffer_size));
        REQUIRE_NOTHROW(manager.validate_buffer_size("policies", buffer_size - 1));
    }

    SECTION("Validation fails when expected size exceeds buffer") {
        REQUIRE_THROWS_AS(
            manager.validate_buffer_size("policies", buffer_size + 1),
            BufferOverflowError
        );
    }

    SECTION("Validation fails for nonexistent buffer") {
        REQUIRE_THROWS_AS(
            manager.validate_buffer_size("nonexistent", 100),
            BufferNotFoundError
        );
    }
}
