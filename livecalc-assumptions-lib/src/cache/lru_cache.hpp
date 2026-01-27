#pragma once

#include <string>
#include <map>
#include <list>
#include <vector>
#include <mutex>
#include <chrono>
#include <filesystem>
#include <stdexcept>

namespace livecalc {
namespace assumptions {

/**
 * Cache entry metadata
 */
struct CacheMetadata {
    std::string key;
    std::string version;
    std::chrono::system_clock::time_point fetch_time;
    size_t data_size;
    std::string sha256_hash;
};

/**
 * Cache entry
 */
struct CacheEntry {
    CacheMetadata metadata;
    std::vector<double> data;
};

/**
 * LRU cache statistics
 */
struct CacheStats {
    size_t hits;
    size_t misses;
    size_t bytes_stored;
    size_t entries_count;
};

/**
 * LRU cache with version immutability
 *
 * Features:
 * - Version-immutable: "table-name:version" keys never change
 * - 'latest' and 'draft' versions never cached (always fetch fresh)
 * - OS-standard cache location
 * - LRU eviction when size limit exceeded
 * - SHA256 integrity checking
 * - Thread-safe for concurrent reads
 * - Graceful degradation if cache dir is read-only
 */
class LRUCache {
public:
    /**
     * Constructor
     * @param cache_dir Cache directory path (default: OS-standard)
     * @param max_size_mb Maximum cache size in MB (default: 500)
     */
    explicit LRUCache(const std::string& cache_dir = "", size_t max_size_mb = 500);

    /**
     * Get entry from cache
     * @param key Cache key (e.g., "mortality-standard:v2.1")
     * @param data Output vector
     * @return true if cache hit, false if miss
     */
    bool get(const std::string& key, std::vector<double>& data);

    /**
     * Put entry in cache
     * @param key Cache key
     * @param version Version string
     * @param data Data vector
     */
    void put(const std::string& key, const std::string& version, const std::vector<double>& data);

    /**
     * Check if key should be cached (not 'latest' or 'draft')
     * @param key Cache key
     * @return true if cacheable
     */
    static bool is_cacheable(const std::string& key);

    /**
     * Get cache statistics
     */
    CacheStats get_stats() const;

    /**
     * Clear all cache entries
     */
    void clear();

private:
    std::filesystem::path cache_dir_;
    size_t max_size_bytes_;
    mutable std::mutex mutex_;

    // LRU tracking
    std::list<std::string> lru_list_;
    std::map<std::string, std::list<std::string>::iterator> lru_map_;
    std::map<std::string, CacheEntry> entries_;

    // Statistics
    mutable size_t hits_;
    mutable size_t misses_;
    size_t total_bytes_;

    // File I/O
    std::filesystem::path get_cache_path(const std::string& key) const;
    void load_from_disk(const std::string& key);
    void save_to_disk(const std::string& key, const CacheEntry& entry);
    void evict_lru();
    void update_lru(const std::string& key);
    std::string compute_sha256(const std::vector<double>& data) const;
    std::string get_default_cache_dir() const;
};

} // namespace assumptions
} // namespace livecalc
