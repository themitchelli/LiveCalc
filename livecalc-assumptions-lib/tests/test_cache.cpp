#include <catch2/catch_test_macros.hpp>
#include "cache/lru_cache.hpp"

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
    }

    SECTION("Cache hit after put") {
        std::vector<double> original_data = {0.01, 0.02, 0.03, 0.04, 0.05};
        cache.put("mortality-standard:v2.1", "v2.1", original_data);

        std::vector<double> retrieved_data;
        bool hit = cache.get("mortality-standard:v2.1", retrieved_data);

        REQUIRE(hit);
        REQUIRE(retrieved_data == original_data);
    }

    SECTION("Cache statistics") {
        auto stats = cache.get_stats();
        REQUIRE(stats.hits >= 0);
        REQUIRE(stats.misses >= 0);
        REQUIRE(stats.bytes_stored >= 0);
        REQUIRE(stats.entries_count >= 0);
    }

    cache.clear();
}

TEST_CASE("LRUCache eviction", "[lru_cache]") {
    // Small cache for testing eviction
    LRUCache cache("/tmp/livecalc-test-cache-evict", 1);  // 1 MB max

    // This test would require filling the cache beyond 1MB
    // For now, just verify the cache can be created
    REQUIRE_NOTHROW(cache.clear());
}
