# LiveCalc Assumptions Library

Shared library for resolving actuarial assumptions from the Assumptions Manager API. Provides C++ and Python interfaces with JWT authentication, version-immutable caching, and thread-safe operations.

## Features

- **C++ and Python APIs**: Use the same assumption resolution logic from any engine
- **Version-immutable caching**: Once fetched, versioned assumptions never change
- **JWT authentication**: Automatic token management and refresh
- **Thread-safe**: Safe for use in multi-threaded projection engines
- **LRU eviction**: Configurable cache size with automatic eviction
- **Policy attribute lookups**: Resolve scalar values based on policy characteristics

## Quick Start (C++)

```cpp
#include "c++/assumptions_client.hpp"

using namespace livecalc::assumptions;

// Initialize client
AssumptionsClient am(
    "https://assumptionsmanager.ddns.net",
    "your-jwt-token",
    "/path/to/cache"  // optional
);

// Resolve full table
auto mortality_table = am.resolve("mortality-standard", "v2.1");

// Resolve scalar value with policy attributes
PolicyAttrs attrs = {
    {"age", 50},
    {"gender", std::string("M")},
    {"smoker", 0}
};

double qx = am.resolve_scalar("mortality-standard", "v2.1", attrs);

// List available versions
auto versions = am.list_versions("mortality-standard");

// Get cache statistics
auto stats = am.get_cache_stats();
std::cout << "Cache hits: " << stats.hits << std::endl;
```

## Quick Start (Python)

```python
from assumptions_client import AssumptionsClient

# Initialize client
am = AssumptionsClient(
    "https://assumptionsmanager.ddns.net",
    "your-jwt-token",
    "/path/to/cache"  # optional
)

# Resolve full table (returns NumPy array)
mortality_table = am.resolve("mortality-standard", "v2.1")

# Resolve scalar value with policy attributes
qx = am.resolve_scalar(
    "mortality-standard",
    "v2.1",
    {"age": 50, "gender": "M", "smoker": False}
)

# List available versions
versions = am.list_versions("mortality-standard")

# Get cache statistics
stats = am.get_cache_stats()
print(f"Cache hits: {stats.hits}, misses: {stats.misses}")
```

## Building

### C++ Prerequisites

- CMake 3.20+
- C++17 compiler
- libcurl
- nlohmann/json (auto-fetched if not found)
- Catch2 (for tests, auto-fetched)

### C++ Build Steps

```bash
mkdir build && cd build
cmake ..
make

# Run tests
make test

# Install library
sudo make install
```

### Python Installation

```bash
cd livecalc-assumptions-lib
pip install -e .

# For development with testing dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/test_python_client.py -v
```

### Linking to Your Project

```cmake
find_package(LiveCalcAssumptionsLib REQUIRED)
target_link_libraries(your_target PRIVATE assumptions_lib)
```

Or manually:

```cmake
target_include_directories(your_target PRIVATE /path/to/livecalc-assumptions-lib/src)
target_link_libraries(your_target PRIVATE /path/to/livecalc-assumptions-lib/build/libassumptions_lib.a curl)
```

## Documentation

- **[Cache Documentation](docs/CACHE.md)**: LRU cache implementation details, thread safety, version immutability
- **[API Reference](docs/API.md)**: Complete C++ and Python API documentation
- **[Integration Guide](docs/INTEGRATION.md)**: How to integrate with projection engines (C++ and Python)

## API Reference

### AssumptionsClient

#### Constructor

```cpp
AssumptionsClient(
    const std::string& am_url,
    const std::string& jwt_token,
    const std::string& cache_dir = ""  // OS-standard if empty
)
```

#### Methods

- `std::vector<double> resolve(const std::string& name, const std::string& version)`
  - Resolves full assumption table
  - Returns: Flat vector of table data (row-major order)

- `double resolve_scalar(const std::string& name, const std::string& version, const PolicyAttrs& policy_attrs)`
  - Resolves single value based on policy attributes
  - Returns: Scalar value (qx, lapse rate, expense)

- `std::vector<std::string> list_versions(const std::string& name)`
  - Lists available versions for a table
  - Returns: Vector of version strings

- `CacheStats get_cache_stats() const`
  - Returns cache statistics (hits, misses, bytes_stored, entries_count)

### Python AssumptionsClient

#### Constructor

```python
AssumptionsClient(
    am_url: str,
    jwt_token: str,
    cache_dir: str = ""  # OS-standard if empty
)
```

#### Methods

- `resolve(name: str, version: str) -> Union[np.ndarray, List[float]]`
  - Resolves full assumption table
  - Returns: NumPy array of table data

- `resolve_scalar(name: str, version: str, policy_attrs: dict) -> float`
  - Resolves single value based on policy attributes
  - Returns: Scalar value (qx, lapse rate, expense)

- `list_versions(name: str) -> List[str]`
  - Lists available versions for a table
  - Returns: List of version strings

- `get_cache_stats() -> CacheStats`
  - Returns cache statistics (hits, misses, bytes_stored, entries)

#### Dependencies

- requests >= 2.28.0
- numpy >= 1.21.0
- platformdirs >= 3.0.0

### JWTHandler

#### Constructor

```cpp
JWTHandler(const std::string& am_url, const std::string& username, const std::string& password)
JWTHandler(const std::string& am_url, const std::string& token)
```

#### Methods

- `std::string get_token()` - Returns current token (auto-refreshes if expiring)
- `int token_expires_in() const` - Returns seconds until expiry
- `void refresh_token()` - Force token refresh

### LRUCache

#### Constructor

```cpp
LRUCache(const std::string& cache_dir = "", size_t max_size_mb = 500)
```

#### Methods

- `bool get(const std::string& key, std::vector<double>& data)` - Get entry from cache
- `void put(const std::string& key, const std::string& version, const std::vector<double>& data)` - Put entry in cache
- `static bool is_cacheable(const std::string& key)` - Check if key should be cached
- `CacheStats get_stats() const` - Get cache statistics
- `void clear()` - Clear all cache entries

## Caching Behavior

- **Version-specific keys** (e.g., `mortality-standard:v2.1`) are cached immutably
- **'latest' and 'draft' versions** are never cached (always fetch fresh)
- **Cache location**: OS-standard cache directories
  - macOS: `~/Library/Caches/LiveCalc`
  - Linux: `~/.cache/livecalc`
  - Windows: `%APPDATA%\LiveCalc\Cache`
- **LRU eviction**: Oldest entries evicted when cache exceeds size limit

## Thread Safety

All classes are thread-safe for concurrent use:
- `AssumptionsClient` uses internal mutexes for cache access
- `JWTHandler` uses mutexes for token refresh
- `LRUCache` uses mutexes for all operations

## Error Handling

All methods throw exceptions on error:
- `AssumptionsError` - Assumption resolution failures
- `JWTError` - Authentication failures
- `HttpClientError` - HTTP communication failures

Example error handling:

```cpp
try {
    auto qx = am.resolve_scalar("mortality-standard", "v2.1", attrs);
} catch (const AssumptionsError& e) {
    std::cerr << "Failed to resolve assumption: " << e.what() << std::endl;
}
```

## Integration with VS Code Extension

The library is designed to be used by calculation engines (C++, Python) that are invoked by the LiveCalc VS Code extension.

Set environment variables for engine initialization:

```bash
export LIVECALC_AM_URL="https://assumptionsmanager.ddns.net"
export LIVECALC_AM_TOKEN="your-jwt-token"
export LIVECALC_AM_CACHE_DIR="/path/to/cache"
```

Or pass credentials programmatically from the extension.

## Examples

See the `examples/` directory for complete working examples:

### C++ Projection Engine

`examples/cpp_engine_usage.cpp` - Complete actuarial projection engine demonstrating:
- Initialization with environment variables
- Batch assumption resolution at startup
- Policy-specific scalar lookups during projection
- Cache statistics reporting

**Build and run:**
```bash
cd livecalc-assumptions-lib
mkdir build && cd build
cmake ..
make

# Compile example
g++ -std=c++17 -I../src ../examples/cpp_engine_usage.cpp \
    -L. -lassumptions_lib -lcurl \
    -o engine_example

# Run (requires AM credentials)
export LIVECALC_AM_URL="https://assumptionsmanager.ddns.net"
export LIVECALC_AM_TOKEN="your-jwt-token"
./engine_example
```

### Python UDF

`examples/python_udf_usage.py` - Python user-defined function demonstrating:
- NumPy integration for efficient table handling
- UDF-based mortality adjustments (e.g., smoker multipliers)
- Error handling and fallback logic

**Run:**
```bash
cd livecalc-assumptions-lib
pip install -e .

export LIVECALC_AM_URL="https://assumptionsmanager.ddns.net"
export LIVECALC_AM_TOKEN="your-jwt-token"
python examples/python_udf_usage.py
```

## License

MIT License - see LICENSE file for details
