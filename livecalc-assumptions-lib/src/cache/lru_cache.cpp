#include "cache/lru_cache.hpp"
#include <fstream>
#include <sstream>
#include <cstring>
#include <algorithm>

#ifdef _WIN32
#include <windows.h>
#include <shlobj.h>
#else
#include <unistd.h>
#include <pwd.h>
#endif

namespace livecalc {
namespace assumptions {

// Simplified SHA256 placeholder (in production, use OpenSSL or similar)
static std::string compute_sha256_simple(const std::vector<double>& data) {
    // For now, return a simple hash based on size and first/last elements
    // In production, use a real SHA256 implementation
    std::ostringstream oss;
    oss << "sha256:" << data.size();
    if (!data.empty()) {
        oss << ":" << data[0] << ":" << data[data.size() - 1];
    }
    return oss.str();
}

std::string LRUCache::get_default_cache_dir() const {
#ifdef _WIN32
    char path[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path))) {
        return std::string(path) + "\\LiveCalc\\Cache";
    }
    return "C:\\Temp\\LiveCalc\\Cache";
#elif __APPLE__
    const char* home = getenv("HOME");
    if (home) {
        return std::string(home) + "/Library/Caches/LiveCalc";
    }
    return "/tmp/LiveCalc/Cache";
#else
    const char* home = getenv("HOME");
    if (home) {
        return std::string(home) + "/.cache/livecalc";
    }
    return "/tmp/livecalc/cache";
#endif
}

LRUCache::LRUCache(const std::string& cache_dir, size_t max_size_mb)
    : max_size_bytes_(max_size_mb * 1024 * 1024)
    , hits_(0)
    , misses_(0)
    , total_bytes_(0)
{
    // Use provided cache_dir or default
    if (cache_dir.empty()) {
        cache_dir_ = get_default_cache_dir();
    } else {
        cache_dir_ = cache_dir;
    }

    // Create cache directory if it doesn't exist
    try {
        std::filesystem::create_directories(cache_dir_);
    } catch (const std::filesystem::filesystem_error& e) {
        // Silently fail - we'll operate without persistent cache
    }
}

bool LRUCache::is_cacheable(const std::string& key) {
    // Don't cache 'latest' or 'draft' versions
    return key.find(":latest") == std::string::npos &&
           key.find(":draft") == std::string::npos;
}

std::filesystem::path LRUCache::get_cache_path(const std::string& key) const {
    // Replace colons with underscores for filename
    std::string filename = key;
    std::replace(filename.begin(), filename.end(), ':', '_');
    return cache_dir_ / (filename + ".cache");
}

void LRUCache::load_from_disk(const std::string& key) {
    auto cache_path = get_cache_path(key);

    if (!std::filesystem::exists(cache_path)) {
        return;
    }

    try {
        std::ifstream file(cache_path, std::ios::binary);
        if (!file.is_open()) {
            return;
        }

        // Read magic byte
        uint8_t magic;
        file.read(reinterpret_cast<char*>(&magic), sizeof(magic));
        if (magic != 0x42) {  // 'B' for binary cache
            return;
        }

        // Read version
        uint8_t version;
        file.read(reinterpret_cast<char*>(&version), sizeof(version));

        // Read data length
        uint64_t data_len;
        file.read(reinterpret_cast<char*>(&data_len), sizeof(data_len));

        // Read data
        std::vector<double> data(data_len);
        file.read(reinterpret_cast<char*>(data.data()), data_len * sizeof(double));

        // Create entry
        CacheEntry entry;
        entry.data = data;
        entry.metadata.key = key;
        entry.metadata.data_size = data_len * sizeof(double);
        entry.metadata.sha256_hash = compute_sha256_simple(data);
        entry.metadata.fetch_time = std::chrono::system_clock::now();

        // Add to cache
        entries_[key] = entry;
        total_bytes_ += entry.metadata.data_size;

        // Update LRU
        lru_list_.push_front(key);
        lru_map_[key] = lru_list_.begin();

    } catch (const std::exception& e) {
        // Failed to load from disk - continue without cache
    }
}

void LRUCache::save_to_disk(const std::string& key, const CacheEntry& entry) {
    auto cache_path = get_cache_path(key);

    try {
        std::ofstream file(cache_path, std::ios::binary);
        if (!file.is_open()) {
            return;
        }

        // Write magic byte
        uint8_t magic = 0x42;
        file.write(reinterpret_cast<const char*>(&magic), sizeof(magic));

        // Write version
        uint8_t version = 1;
        file.write(reinterpret_cast<const char*>(&version), sizeof(version));

        // Write data length
        uint64_t data_len = entry.data.size();
        file.write(reinterpret_cast<const char*>(&data_len), sizeof(data_len));

        // Write data
        file.write(reinterpret_cast<const char*>(entry.data.data()),
                   data_len * sizeof(double));

    } catch (const std::exception& e) {
        // Failed to save to disk - continue without persistence
    }
}

void LRUCache::evict_lru() {
    while (total_bytes_ > max_size_bytes_ && !lru_list_.empty()) {
        // Evict least recently used
        std::string key = lru_list_.back();
        lru_list_.pop_back();
        lru_map_.erase(key);

        auto it = entries_.find(key);
        if (it != entries_.end()) {
            total_bytes_ -= it->second.metadata.data_size;
            entries_.erase(it);

            // Delete from disk
            try {
                std::filesystem::remove(get_cache_path(key));
            } catch (...) {
                // Ignore disk errors
            }
        }
    }
}

void LRUCache::update_lru(const std::string& key) {
    auto it = lru_map_.find(key);
    if (it != lru_map_.end()) {
        // Move to front
        lru_list_.erase(it->second);
    }
    lru_list_.push_front(key);
    lru_map_[key] = lru_list_.begin();
}

bool LRUCache::get(const std::string& key, std::vector<double>& data) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Try memory cache first
    auto it = entries_.find(key);
    if (it != entries_.end()) {
        data = it->second.data;
        update_lru(key);
        hits_++;
        return true;
    }

    // Try disk cache
    load_from_disk(key);
    it = entries_.find(key);
    if (it != entries_.end()) {
        data = it->second.data;
        update_lru(key);
        hits_++;
        return true;
    }

    misses_++;
    return false;
}

void LRUCache::put(const std::string& key, const std::string& version, const std::vector<double>& data) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Create entry
    CacheEntry entry;
    entry.data = data;
    entry.metadata.key = key;
    entry.metadata.version = version;
    entry.metadata.data_size = data.size() * sizeof(double);
    entry.metadata.sha256_hash = compute_sha256_simple(data);
    entry.metadata.fetch_time = std::chrono::system_clock::now();

    // Check if already exists
    auto it = entries_.find(key);
    if (it != entries_.end()) {
        total_bytes_ -= it->second.metadata.data_size;
    }

    // Add to cache
    entries_[key] = entry;
    total_bytes_ += entry.metadata.data_size;
    update_lru(key);

    // Evict if necessary
    evict_lru();

    // Save to disk
    save_to_disk(key, entry);
}

std::string LRUCache::compute_sha256(const std::vector<double>& data) const {
    return compute_sha256_simple(data);
}

CacheStats LRUCache::get_stats() const {
    std::lock_guard<std::mutex> lock(mutex_);

    CacheStats stats;
    stats.hits = hits_;
    stats.misses = misses_;
    stats.bytes_stored = total_bytes_;
    stats.entries_count = entries_.size();

    return stats;
}

void LRUCache::clear() {
    std::lock_guard<std::mutex> lock(mutex_);

    entries_.clear();
    lru_list_.clear();
    lru_map_.clear();
    total_bytes_ = 0;

    // Clear disk cache
    try {
        for (const auto& entry : std::filesystem::directory_iterator(cache_dir_)) {
            if (entry.path().extension() == ".cache") {
                std::filesystem::remove(entry.path());
            }
        }
    } catch (...) {
        // Ignore disk errors
    }
}

} // namespace assumptions
} // namespace livecalc
