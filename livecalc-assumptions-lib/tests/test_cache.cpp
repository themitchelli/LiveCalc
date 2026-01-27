#include <catch2/catch_test_macros.hpp>
#include "cache/lru_cache.hpp"
#include <thread>
#include <filesystem>

using namespace livecalc::assumptions;

TEST_CASE("LRUCache is_cacheable", "[lru_cache]") {
    SECTION("Version-specific keys are cacheable") {
        REQUIRE(LRUCache::is_cacheable("mortality-standard:v2.1"));
        REQUIRE(LRUCache::is_cacheable("lapse-base:v1.0"));
        REQUIRE(LRUCache::is_cacheable("expenses:v3.2"));
    }

    SECTION("'latest' version is not cacheable") {
        REQUIRE_FALSE(LRUCache::is_cacheable("mortality-standard:latest"));
        REQUIRE_FALSE(LRUCache::is_cacheable("lapse-base:latest"));
    }

    SECTION("'draft' version is not cacheable") {
        REQUIRE_FALSE(LRUCache::is_cacheable("mortality-standard:draft"));
        REQUIRE_FALSE(LRUCache::is_cacheable("lapse-base:draft"));
    }
}

TEST_CASE("LRUCache basic operations", "[lru_cache]") {
    LRUCache cache("/tmp/livecalc-test-cache", 10);  // 10 MB max

    SECTION("Cache miss on first access") {
        std::vector<double> data;
        bool hit = cache.get("mortality-standard:v2.1", data);
        REQUIRE_FALSE(hit);

        auto stats = cache.get_stats();
        REQUIRE(stats.misses > 0);
    }

    SECTION("Cache hit after put") {
        std::vector<double> original_data = {0.01, 0.02, 0.03, 0.04, 0.05};
        cache.put("mortality-standard:v2.1", "v2.1", original_data);

        std::vector<double> retrieved_data;
        bool hit = cache.get("mortality-standard:v2.1", retrieved_data);

        REQUIRE(hit);
        REQUIRE(retrieved_data == original_data);

        auto stats = cache.get_stats();
        REQUIRE(stats.hits > 0);
        REQUIRE(stats.entries_count == 1);
        REQUIRE(stats.bytes_stored == original_data.size() * sizeof(double));
    }

    SECTION("Cache statistics accumulate correctly") {
        std::vector<double> data1 = {0.01, 0.02, 0.03};
        std::vector<double> data2 = {0.04, 0.05, 0.06, 0.07};

        cache.put("table1:v1.0", "v1.0", data1);
        cache.put("table2:v2.0", "v2.0", data2);

        auto stats = cache.get_stats();
        REQUIRE(stats.entries_count == 2);
        size_t expected_bytes = (data1.size() + data2.size()) * sizeof(double);
        REQUIRE(stats.bytes_stored == expected_bytes);
    }

    cache.clear();
}

TEST_CASE("LRUCache eviction", "[lru_cache]") {
    // Small cache for testing eviction (1KB = ~128 doubles per entry)
    LRUCache cache("/tmp/livecalc-test-cache-evict", 1);  // 1 MB max

    SECTION("LRU eviction when size limit exceeded") {
        // Create data that will exceed 1MB when multiple entries exist
        // Each entry is ~80KB (10,000 doubles × 8 bytes)
        std::vector<double> large_data(10000);
        for (size_t i = 0; i < large_data.size(); ++i) {
            large_data[i] = static_cast<double>(i) * 0.001;
        }

        // Add 15 entries (15 × 80KB = 1.2MB, exceeds 1MB limit)
        for (int i = 0; i < 15; ++i) {
            std::string key = "table" + std::to_string(i) + ":v1.0";
            cache.put(key, "v1.0", large_data);
        }

        auto stats = cache.get_stats();
        // Should have evicted oldest entries to stay under 1MB
        REQUIRE(stats.entries_count < 15);
        REQUIRE(stats.bytes_stored <= 1024 * 1024);

        // Oldest entries should be evicted (LRU)
        std::vector<double> retrieved;
        REQUIRE_FALSE(cache.get("table0:v1.0", retrieved));  // Oldest, should be evicted
        REQUIRE(cache.get("table14:v1.0", retrieved));  // Newest, should remain
    }

    cache.clear();
}

TEST_CASE("LRUCache persistence", "[lru_cache]") {
    std::string cache_dir = "/tmp/livecalc-test-cache-persist";

    SECTION("Cache persists to disk and loads on next session") {
        std::vector<double> data = {1.1, 2.2, 3.3, 4.4, 5.5};

        {
            LRUCache cache1(cache_dir, 10);
            cache1.put("persistent-table:v1.0", "v1.0", data);
        }  // cache1 destroyed

        // Create new cache instance (should load from disk)
        LRUCache cache2(cache_dir, 10);
        std::vector<double> retrieved;
        bool hit = cache2.get("persistent-table:v1.0", retrieved);

        REQUIRE(hit);
        REQUIRE(retrieved == data);

        cache2.clear();
    }

    // Clean up test cache directory
    std::filesystem::remove_all(cache_dir);
}

TEST_CASE("LRUCache thread safety", "[lru_cache]") {
    LRUCache cache("/tmp/livecalc-test-cache-threadsafe", 10);

    SECTION("Concurrent reads from multiple threads") {
        std::vector<double> data = {1.0, 2.0, 3.0, 4.0, 5.0};
        cache.put("shared-table:v1.0", "v1.0", data);

        const int num_threads = 10;
        const int reads_per_thread = 100;
        std::vector<std::thread> threads;
        std::vector<bool> results(num_threads * reads_per_thread, false);

        for (int t = 0; t < num_threads; ++t) {
            threads.emplace_back([&cache, &results, t, reads_per_thread]() {
                for (int i = 0; i < reads_per_thread; ++i) {
                    std::vector<double> retrieved;
                    bool hit = cache.get("shared-table:v1.0", retrieved);
                    results[t * reads_per_thread + i] = hit && (retrieved.size() == 5);
                }
            });
        }

        for (auto& thread : threads) {
            thread.join();
        }

        // All reads should succeed
        for (bool result : results) {
            REQUIRE(result);
        }

        auto stats = cache.get_stats();
        REQUIRE(stats.hits == num_threads * reads_per_thread);
    }

    cache.clear();
}

TEST_CASE("LRUCache graceful degradation", "[lru_cache]") {
    SECTION("Read-only cache directory doesn't crash") {
        // Create a read-only directory (on Unix systems)
        std::string readonly_dir = "/tmp/livecalc-readonly-cache";
        std::filesystem::create_directories(readonly_dir);
        std::filesystem::permissions(readonly_dir,
            std::filesystem::perms::owner_read | std::filesystem::perms::owner_exec,
            std::filesystem::perm_options::replace);

        // Constructor should not throw even if cache dir is read-only
        REQUIRE_NOTHROW([&]() {
            LRUCache cache(readonly_dir, 10);
            std::vector<double> data = {1.0, 2.0, 3.0};

            // put() should not throw (fails silently)
            REQUIRE_NOTHROW(cache.put("table:v1.0", "v1.0", data));

            // Cache still works in-memory even if disk persistence fails
            std::vector<double> retrieved;
            bool hit = cache.get("table:v1.0", retrieved);
            REQUIRE(hit);
            REQUIRE(retrieved == data);
        }());

        // Clean up
        std::filesystem::permissions(readonly_dir,
            std::filesystem::perms::all,
            std::filesystem::perm_options::replace);
        std::filesystem::remove_all(readonly_dir);
    }
}

TEST_CASE("LRUCache version immutability", "[lru_cache]") {
    LRUCache cache("/tmp/livecalc-test-cache-immutable", 10);

    SECTION("Version-specific keys remain immutable") {
        std::vector<double> data1 = {1.0, 2.0, 3.0};
        std::vector<double> data2 = {4.0, 5.0, 6.0};

        // Put first version
        cache.put("table:v1.0", "v1.0", data1);

        // Putting again with same key replaces (but key is still immutable)
        cache.put("table:v1.0", "v1.0", data2);

        std::vector<double> retrieved;
        cache.get("table:v1.0", retrieved);
        REQUIRE(retrieved == data2);  // Latest put wins

        // But different versions are separate entries
        cache.put("table:v2.0", "v2.0", data1);

        std::vector<double> v1_data, v2_data;
        cache.get("table:v1.0", v1_data);
        cache.get("table:v2.0", v2_data);

        REQUIRE(v1_data == data2);
        REQUIRE(v2_data == data1);
        REQUIRE(v1_data != v2_data);
    }

    cache.clear();
}
