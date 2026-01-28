#ifndef LIVECALC_ORCHESTRATOR_BUFFER_MANAGER_HPP
#define LIVECALC_ORCHESTRATOR_BUFFER_MANAGER_HPP

#include <cstdint>
#include <cstddef>
#include <memory>
#include <string>
#include <map>
#include <vector>
#include <stdexcept>

namespace livecalc {
namespace orchestrator {

// ============================================================================
// Buffer Type Definitions
// ============================================================================

/**
 * InputBuffer: Policy data for projection engines
 *
 * Layout (32 bytes per policy, 16-byte aligned):
 *   - policy_id:  uint64_t (8 bytes) - Unique policy identifier
 *   - age:        uint8_t  (1 byte)  - Age at entry (0-120)
 *   - gender:     uint8_t  (1 byte)  - 0=Male, 1=Female, 2=Other
 *   - underwriting_class: uint8_t (1 byte) - 0=Standard, 1=Smoker, etc.
 *   - product_type: uint8_t (1 byte) - 0=Term, 1=Whole Life, etc.
 *   - padding1:   uint32_t (4 bytes) - Alignment padding
 *   - sum_assured: double  (8 bytes) - Sum assured amount
 *   - premium:    double   (8 bytes) - Annual premium
 *
 * Total: 32 bytes (16-byte aligned)
 */
struct InputBufferRecord {
    uint64_t policy_id;
    uint8_t age;
    uint8_t gender;
    uint8_t underwriting_class;
    uint8_t product_type;
    uint32_t padding1;  // Alignment to 16 bytes
    double sum_assured;
    double premium;
} __attribute__((aligned(16)));

static_assert(sizeof(InputBufferRecord) == 32, "InputBufferRecord must be 32 bytes");
static_assert(alignof(InputBufferRecord) == 16, "InputBufferRecord must be 16-byte aligned");

/**
 * ScenarioBuffer: Economic scenarios (ESG output → Projection input)
 *
 * Layout (16 bytes per row, 16-byte aligned):
 *   - scenario_id: uint32_t (4 bytes) - Scenario identifier (outer_id * 1000 + inner_id)
 *   - year:        uint32_t (4 bytes) - Projection year (1-indexed, 1-50)
 *   - rate:        double   (8 bytes) - Interest rate (per-annum, e.g., 0.03 for 3%)
 *
 * Total: 16 bytes (naturally 16-byte aligned with double alignment)
 *
 * Example:
 *   10 outer paths × 1000 inner paths × 50 years = 500,000 rows
 *   500,000 rows × 16 bytes = 8 MB
 */
struct ScenarioBufferRecord {
    uint32_t scenario_id;
    uint32_t year;
    double rate;
} __attribute__((aligned(16)));

static_assert(sizeof(ScenarioBufferRecord) == 16, "ScenarioBufferRecord must be 16 bytes");
static_assert(alignof(ScenarioBufferRecord) == 16, "ScenarioBufferRecord must be 16-byte aligned");

/**
 * ResultBuffer: Projection results (Projection output → Solver input)
 *
 * Layout (32 bytes per result, 16-byte aligned):
 *   - scenario_id: uint32_t (4 bytes) - Scenario identifier
 *   - policy_id:   uint32_t (4 bytes) - Policy identifier
 *   - npv:         double   (8 bytes) - Net present value
 *   - padding1:    uint64_t (8 bytes) - Reserved for future metrics (e.g., std_dev, cte_95)
 *   - padding2:    uint64_t (8 bytes) - Alignment padding to 16-byte boundary
 *
 * Total: 32 bytes (16-byte aligned)
 *
 * Note: For aggregated results (Solver output), use aggregated layout:
 *   - scenario_id, mean_npv, std_dev, cte_95, etc.
 */
struct ResultBufferRecord {
    uint32_t scenario_id;
    uint32_t policy_id;
    double npv;
    uint64_t padding1;  // Reserved for future expansion
} __attribute__((aligned(16)));

static_assert(sizeof(ResultBufferRecord) == 32, "ResultBufferRecord must be 32 bytes");
static_assert(alignof(ResultBufferRecord) == 16, "ResultBufferRecord must be 16-byte aligned");

// ============================================================================
// Buffer Metadata
// ============================================================================

enum class BufferType {
    INPUT,     // Policy data
    SCENARIO,  // Economic scenarios
    RESULT     // Projection results
};

struct BufferInfo {
    BufferType type;
    std::string name;           // User-friendly name (e.g., "policies", "scenarios", "results")
    size_t record_size;         // Size of one record in bytes
    size_t num_records;         // Number of records
    size_t total_size;          // Total buffer size in bytes
    void* data;                 // Pointer to buffer data (aligned)
    bool is_shared;             // True if buffer is SharedArrayBuffer

    BufferInfo()
        : type(BufferType::INPUT), record_size(0), num_records(0),
          total_size(0), data(nullptr), is_shared(false) {}
};

// ============================================================================
// Buffer Manager
// ============================================================================

/**
 * BufferManager: Manages allocation and lifecycle of SharedArrayBuffer(s)
 *
 * Features:
 * - Allocates 16-byte aligned buffers for SIMD compatibility
 * - Tracks buffer metadata (type, size, ownership)
 * - Supports buffer reuse across multiple runChunk() calls
 * - Validates buffer sizes before allocation
 * - Zero-copy: buffers are shared between engines
 *
 * Usage:
 *   BufferManager manager;
 *   auto input = manager.allocate_buffer(BufferType::INPUT, "policies", 10000);
 *   auto scenarios = manager.allocate_buffer(BufferType::SCENARIO, "scenarios", 500000);
 *
 *   // Use buffers with engines
 *   engine_a->runChunk(nullptr, 0, scenarios.data, scenarios.total_size);
 *   engine_b->runChunk(scenarios.data, scenarios.total_size, output, output_size);
 *
 *   // Cleanup (automatic on destruction)
 */
class BufferManager {
public:
    BufferManager();
    ~BufferManager();

    // Disable copy/move (buffers are not copyable)
    BufferManager(const BufferManager&) = delete;
    BufferManager& operator=(const BufferManager&) = delete;

    /**
     * Allocate a new buffer
     *
     * @param type Buffer type (INPUT, SCENARIO, RESULT)
     * @param name User-friendly buffer name
     * @param num_records Number of records to allocate
     * @return BufferInfo with allocated buffer details
     * @throws std::runtime_error if allocation fails or num_records exceeds limits
     */
    BufferInfo allocate_buffer(BufferType type, const std::string& name, size_t num_records);

    /**
     * Get buffer by name
     *
     * @param name Buffer name
     * @return BufferInfo for the named buffer
     * @throws std::runtime_error if buffer not found
     */
    BufferInfo get_buffer(const std::string& name) const;

    /**
     * Check if buffer exists
     *
     * @param name Buffer name
     * @return true if buffer exists
     */
    bool has_buffer(const std::string& name) const;

    /**
     * Free a specific buffer
     *
     * @param name Buffer name
     */
    void free_buffer(const std::string& name);

    /**
     * Free all buffers
     */
    void free_all();

    /**
     * Get total allocated memory in bytes
     *
     * @return Total bytes allocated
     */
    size_t get_total_allocated() const;

    /**
     * Get buffer statistics
     *
     * @return Map of buffer name → size in bytes
     */
    std::map<std::string, size_t> get_buffer_stats() const;

    /**
     * Validate buffer can hold expected data
     *
     * @param name Buffer name
     * @param expected_size Expected size in bytes
     * @throws std::runtime_error if buffer too small
     */
    void validate_buffer_size(const std::string& name, size_t expected_size) const;

    /**
     * Get record size for buffer type
     *
     * @param type Buffer type
     * @return Size of one record in bytes
     */
    static size_t get_record_size(BufferType type);

    /**
     * Get maximum number of records for buffer type
     *
     * Limits based on memory considerations:
     * - INPUT: 10M policies (320 MB)
     * - SCENARIO: 100M rows (1.6 GB, e.g., 10 outer × 10K inner × 1K years)
     * - RESULT: 100M results (3.2 GB)
     *
     * @param type Buffer type
     * @return Maximum number of records
     */
    static size_t get_max_records(BufferType type);

private:
    std::map<std::string, BufferInfo> buffers_;
    size_t total_allocated_;

    /**
     * Allocate 16-byte aligned memory
     *
     * @param size Size in bytes
     * @return Pointer to aligned memory
     * @throws std::bad_alloc if allocation fails
     */
    static void* allocate_aligned(size_t size);

    /**
     * Free aligned memory
     *
     * @param ptr Pointer to free
     */
    static void free_aligned(void* ptr);
};

// ============================================================================
// Buffer Errors
// ============================================================================

class BufferError : public std::runtime_error {
public:
    explicit BufferError(const std::string& message) : std::runtime_error(message) {}
};

class BufferOverflowError : public BufferError {
public:
    explicit BufferOverflowError(const std::string& message) : BufferError(message) {}
};

class BufferNotFoundError : public BufferError {
public:
    explicit BufferNotFoundError(const std::string& message) : BufferError(message) {}
};

} // namespace orchestrator
} // namespace livecalc

#endif // LIVECALC_ORCHESTRATOR_BUFFER_MANAGER_HPP
