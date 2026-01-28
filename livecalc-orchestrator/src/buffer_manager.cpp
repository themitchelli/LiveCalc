#include "buffer_manager.hpp"
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <algorithm>

#ifdef _WIN32
#include <malloc.h>
#endif

namespace livecalc {
namespace orchestrator {

// ============================================================================
// BufferManager Implementation
// ============================================================================

BufferManager::BufferManager() : total_allocated_(0) {}

BufferManager::~BufferManager() {
    free_all();
}

BufferInfo BufferManager::allocate_buffer(BufferType type, const std::string& name, size_t num_records) {
    // Check if buffer already exists
    if (has_buffer(name)) {
        std::ostringstream oss;
        oss << "Buffer '" << name << "' already exists";
        throw BufferError(oss.str());
    }

    // Validate num_records
    if (num_records == 0) {
        throw BufferError("Cannot allocate buffer with 0 records");
    }

    size_t max_records = get_max_records(type);
    if (num_records > max_records) {
        std::ostringstream oss;
        oss << "Buffer '" << name << "' exceeds maximum records: "
            << num_records << " > " << max_records
            << " (consider chunking data)";
        throw BufferOverflowError(oss.str());
    }

    // Calculate sizes
    size_t record_size = get_record_size(type);
    size_t total_size = num_records * record_size;

    // Allocate aligned memory
    void* data = nullptr;
    try {
        data = allocate_aligned(total_size);
    } catch (const std::bad_alloc& e) {
        std::ostringstream oss;
        oss << "Failed to allocate " << total_size << " bytes for buffer '" << name << "'";
        throw BufferError(oss.str());
    }

    // Zero-initialize memory
    std::memset(data, 0, total_size);

    // Create buffer info
    BufferInfo info;
    info.type = type;
    info.name = name;
    info.record_size = record_size;
    info.num_records = num_records;
    info.total_size = total_size;
    info.data = data;
    info.is_shared = true;  // All buffers are shared (zero-copy)

    // Store in map
    buffers_[name] = info;
    total_allocated_ += total_size;

    return info;
}

BufferInfo BufferManager::get_buffer(const std::string& name) const {
    auto it = buffers_.find(name);
    if (it == buffers_.end()) {
        std::ostringstream oss;
        oss << "Buffer '" << name << "' not found";
        throw BufferNotFoundError(oss.str());
    }
    return it->second;
}

bool BufferManager::has_buffer(const std::string& name) const {
    return buffers_.find(name) != buffers_.end();
}

void BufferManager::free_buffer(const std::string& name) {
    auto it = buffers_.find(name);
    if (it == buffers_.end()) {
        return;  // Already freed or never allocated
    }

    BufferInfo& info = it->second;
    if (info.data != nullptr) {
        free_aligned(info.data);
        info.data = nullptr;
        total_allocated_ -= info.total_size;
    }

    buffers_.erase(it);
}

void BufferManager::free_all() {
    for (auto& pair : buffers_) {
        BufferInfo& info = pair.second;
        if (info.data != nullptr) {
            free_aligned(info.data);
            info.data = nullptr;
        }
    }
    buffers_.clear();
    total_allocated_ = 0;
}

size_t BufferManager::get_total_allocated() const {
    return total_allocated_;
}

std::map<std::string, size_t> BufferManager::get_buffer_stats() const {
    std::map<std::string, size_t> stats;
    for (const auto& pair : buffers_) {
        stats[pair.first] = pair.second.total_size;
    }
    return stats;
}

void BufferManager::validate_buffer_size(const std::string& name, size_t expected_size) const {
    BufferInfo info = get_buffer(name);
    if (info.total_size < expected_size) {
        std::ostringstream oss;
        oss << "Buffer '" << name << "' too small: "
            << info.total_size << " bytes < " << expected_size << " bytes required";
        throw BufferOverflowError(oss.str());
    }
}

size_t BufferManager::get_record_size(BufferType type) {
    switch (type) {
        case BufferType::INPUT:
            return sizeof(InputBufferRecord);
        case BufferType::SCENARIO:
            return sizeof(ScenarioBufferRecord);
        case BufferType::RESULT:
            return sizeof(ResultBufferRecord);
        default:
            throw BufferError("Unknown buffer type");
    }
}

size_t BufferManager::get_max_records(BufferType type) {
    switch (type) {
        case BufferType::INPUT:
            // 10M policies × 32 bytes = 320 MB
            return 10'000'000;
        case BufferType::SCENARIO:
            // 100M rows × 16 bytes = 1.6 GB
            // Example: 10 outer × 10K inner × 1K years = 100M rows
            return 100'000'000;
        case BufferType::RESULT:
            // 100M results × 32 bytes = 3.2 GB
            return 100'000'000;
        default:
            throw BufferError("Unknown buffer type");
    }
}

// ============================================================================
// Aligned Memory Allocation
// ============================================================================

void* BufferManager::allocate_aligned(size_t size) {
    // Ensure size is a multiple of 16 bytes
    size_t aligned_size = (size + 15) & ~15;

    void* ptr = nullptr;

#ifdef _WIN32
    // Windows: _aligned_malloc
    ptr = _aligned_malloc(aligned_size, 16);
#else
    // POSIX: posix_memalign
    int result = posix_memalign(&ptr, 16, aligned_size);
    if (result != 0) {
        throw std::bad_alloc();
    }
#endif

    if (ptr == nullptr) {
        throw std::bad_alloc();
    }

    return ptr;
}

void BufferManager::free_aligned(void* ptr) {
    if (ptr == nullptr) {
        return;
    }

#ifdef _WIN32
    _aligned_free(ptr);
#else
    free(ptr);
#endif
}

} // namespace orchestrator
} // namespace livecalc
