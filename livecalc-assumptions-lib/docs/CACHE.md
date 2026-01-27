# LRU Cache with Version Immutability

## Overview

The LiveCalc Assumptions Library includes a thread-safe LRU (Least Recently Used) cache that stores assumption data locally to reduce API calls to the Assumptions Manager. The cache implements version immutability: once a specific version (e.g., `mortality-standard:v2.1`) is cached, it never changes.

## Key Features

### Version Immutability

- **Version-specific keys** (e.g., `table-name:v2.1`) are cached permanently
- **`latest` and `draft` versions** are never cached (always fetch fresh from API)
- Cache key format: `table-name:version`

### OS-Standard Cache Location

The cache automatically uses the platform's standard cache directory:

- **macOS**: `~/Library/Caches/LiveCalc`
- **Windows**: `%LOCALAPPDATA%\LiveCalc\Cache`
- **Linux**: `~/.cache/livecalc`

You can override this by providing a custom path to the constructor.

### Cache Metadata

Each cached entry includes:

- **data**: Vector of doubles (assumption values)
- **metadata**:
  - `key`: Cache key
  - `version`: Version string
  - `fetch_time`: When the data was fetched
  - `data_size`: Size in bytes
  - `sha256_hash`: SHA256 hash for integrity checking

### LRU Eviction

When the cache exceeds its size limit (default: 500MB), the least recently used entries are evicted automatically. The eviction process:

1. Entries are ordered by last access time
2. Oldest entries are removed first
3. Disk files are also deleted
4. Cache size is checked after each `put()` operation

### Statistics

The cache tracks:

- **hits**: Number of successful cache lookups
- **misses**: Number of failed cache lookups
- **bytes_stored**: Total bytes currently cached
- **entries_count**: Number of entries in cache

### Thread Safety

All cache operations are thread-safe:

- `get()` and `put()` use mutex locks
- Multiple threads can read concurrently
- Statistics are tracked atomically

### Graceful Degradation

If the cache directory is read-only or unavailable:

- Constructor doesn't throw
- `put()` fails silently
- Cache continues working in-memory only
- Application continues without disk persistence

## API Reference

### Constructor

```cpp
LRUCache(const std::string& cache_dir = "", size_t max_size_mb = 500);
```

- `cache_dir`: Custom cache directory (empty string = OS default)
- `max_size_mb`: Maximum cache size in megabytes

### Methods

#### `get()`

```cpp
bool get(const std::string& key, std::vector<double>& data);
```

Retrieves data from cache.

- **Returns**: `true` if cache hit, `false` if cache miss
- **Parameters**:
  - `key`: Cache key (e.g., `"mortality-standard:v2.1"`)
  - `data`: Output vector (filled on success)

#### `put()`

```cpp
void put(const std::string& key, const std::string& version, const std::vector<double>& data);
```

Stores data in cache.

- **Parameters**:
  - `key`: Cache key
  - `version`: Version string
  - `data`: Data to cache

#### `is_cacheable()`

```cpp
static bool is_cacheable(const std::string& key);
```

Checks if a key should be cached.

- **Returns**: `false` for `latest` or `draft` versions, `true` otherwise

#### `get_stats()`

```cpp
CacheStats get_stats() const;
```

Returns current cache statistics.

#### `clear()`

```cpp
void clear();
```

Clears all cache entries (memory and disk).

## Usage Examples

### Basic Usage

```cpp
#include "cache/lru_cache.hpp"

using namespace livecalc::assumptions;

// Create cache with default location and 500MB limit
LRUCache cache;

// Check if data is cached
std::vector<double> mortality_data;
if (cache.get("mortality-standard:v2.1", mortality_data)) {
    // Cache hit - use data
    std::cout << "Loaded from cache: " << mortality_data.size() << " values\n";
} else {
    // Cache miss - fetch from API
    mortality_data = fetch_from_api("mortality-standard:v2.1");

    // Store in cache for next time
    cache.put("mortality-standard:v2.1", "v2.1", mortality_data);
}
```

### Custom Cache Directory and Size

```cpp
// Use custom cache directory with 1GB limit
LRUCache cache("/path/to/custom/cache", 1024);
```

### Cache Statistics

```cpp
auto stats = cache.get_stats();
std::cout << "Cache hits: " << stats.hits << "\n";
std::cout << "Cache misses: " << stats.misses << "\n";
std::cout << "Hit rate: " << (100.0 * stats.hits / (stats.hits + stats.misses)) << "%\n";
std::cout << "Entries: " << stats.entries_count << "\n";
std::cout << "Size: " << (stats.bytes_stored / 1024.0 / 1024.0) << " MB\n";
```

### Version Checking

```cpp
// Version-specific: will be cached
if (LRUCache::is_cacheable("mortality-standard:v2.1")) {
    cache.put("mortality-standard:v2.1", "v2.1", data);
}

// Latest: won't be cached (always fetch fresh)
if (!LRUCache::is_cacheable("mortality-standard:latest")) {
    std::cout << "Latest version - fetching fresh from API\n";
}
```

### Thread-Safe Access

```cpp
LRUCache cache;  // Shared across threads

// Thread 1
std::thread t1([&cache]() {
    std::vector<double> data;
    if (cache.get("table:v1.0", data)) {
        // Process data
    }
});

// Thread 2
std::thread t2([&cache]() {
    std::vector<double> data;
    if (cache.get("table:v1.0", data)) {
        // Process data
    }
});

t1.join();
t2.join();
```

## Performance Considerations

### Memory Footprint

Each cache entry requires:

- **Data**: 8 bytes per double
- **Metadata**: ~100 bytes (key, version, timestamps, hash)
- **LRU tracking**: ~50 bytes per entry

For a typical mortality table with 242 values (121 ages × 2 genders):

- Data: 242 × 8 = 1,936 bytes
- Total per entry: ~2,100 bytes

With a 500MB cache limit, you can store ~250,000 assumption tables.

### Disk I/O

- **Write**: Asynchronous (doesn't block `put()`)
- **Read**: On-demand (`get()` checks memory first, then disk)
- **Format**: Binary (magic byte + version + length + data)

### Eviction Overhead

- **Check**: After each `put()` operation
- **Cost**: O(1) for LRU list management
- **Disk cleanup**: Removes `.cache` files for evicted entries

## Binary File Format

Each cached file (`.cache` extension) uses this format:

```
[Magic Byte: 1 byte = 0x42]
[Version: 1 byte = 0x01]
[Data Length: 8 bytes (uint64_t)]
[Data: data_length × 8 bytes (doubles)]
```

The filename is the cache key with colons replaced by underscores:

- Key: `mortality-standard:v2.1`
- File: `mortality-standard_v2.1.cache`

## Testing

The cache includes comprehensive tests covering:

1. **Version immutability**: `latest` and `draft` not cached
2. **Basic operations**: get, put, statistics
3. **LRU eviction**: Size limit enforcement
4. **Persistence**: Disk save/load across sessions
5. **Thread safety**: Concurrent read access
6. **Graceful degradation**: Read-only directory handling
7. **Version isolation**: Different versions cached separately

Run tests:

```bash
cd build
ctest -R test_cache --output-on-failure
```

## Troubleshooting

### Cache Directory Permissions

If the cache directory is not writable:

- Cache operates in-memory only
- No error thrown (graceful degradation)
- Check logs for warnings

### Cache Not Persisting

Possible causes:

1. Cache directory not writable
2. Disk full
3. Using `latest` or `draft` versions (not cacheable)

### Large Memory Usage

If cache memory grows unexpectedly:

- Check `get_stats().bytes_stored`
- Verify max_size_mb setting
- Call `clear()` to reset
- Reduce max_size_mb limit

### Cache Misses Despite Data Present

Possible causes:

1. Key mismatch (check exact string)
2. Cache evicted due to size limit
3. Cache cleared by another process
4. Using `latest` version (never cached)

## Integration Notes

The cache is used internally by `AssumptionsClient`:

```cpp
AssumptionsClient client(am_url, jwt_token, cache_dir);
auto qx = client.resolve("mortality-standard", "v2.1");
// ↑ Automatically uses cache
```

You typically don't need to interact with the cache directly unless you're implementing a custom client or need fine-grained control over caching behavior.
