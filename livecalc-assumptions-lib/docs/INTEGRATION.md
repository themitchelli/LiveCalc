# Integration Guide

This guide explains how to integrate the LiveCalc Assumptions Library into your C++ or Python projection engines.

## Overview

The Assumptions Library provides a unified interface for resolving actuarial assumptions from the Assumptions Manager API. It handles:

- JWT authentication and token management
- Version-immutable caching with LRU eviction
- Thread-safe operations for multi-threaded engines
- Policy attribute-based lookups

## Integration Architecture

```
┌─────────────────────────────────────────┐
│       Your Projection Engine            │
│  ┌───────────────────────────────────┐  │
│  │  Engine Initialization           │  │
│  │  - Load assumptions_client       │  │
│  │  - Pass JWT token + AM URL       │  │
│  └───────────────────────────────────┘  │
│              ↓                           │
│  ┌───────────────────────────────────┐  │
│  │  Assumptions Client              │  │
│  │  - resolve() for full tables     │  │
│  │  - resolve_scalar() for lookups  │  │
│  └───────────────────────────────────┘  │
│              ↓                           │
│  ┌───────────────────────────────────┐  │
│  │  Cache Layer (LRU)               │  │
│  │  - Version-immutable             │  │
│  │  - Local filesystem              │  │
│  └───────────────────────────────────┘  │
│              ↓                           │
│  ┌───────────────────────────────────┐  │
│  │  HTTP Client                     │  │
│  │  - Retry logic                   │  │
│  │  - Timeout protection            │  │
│  └───────────────────────────────────┘  │
│              ↓                           │
│              ↓  JWT Auth + REST API     │
└──────────────↓───────────────────────────┘
               ↓
   ┌────────────────────────┐
   │ Assumptions Manager    │
   │ API (Cloud Service)    │
   └────────────────────────┘
```

---

## C++ Integration

### 1. Add Library to Your Project

#### Option A: CMake FetchContent (Recommended)

Add to your `CMakeLists.txt`:

```cmake
include(FetchContent)

FetchContent_Declare(
    assumptions_lib
    GIT_REPOSITORY https://github.com/themitchelli/LiveCalc.git
    GIT_TAG main
    SOURCE_SUBDIR livecalc-assumptions-lib
)

FetchContent_MakeAvailable(assumptions_lib)

target_link_libraries(your_engine PRIVATE assumptions_lib)
```

#### Option B: As a Git Submodule

```bash
cd your-project
git submodule add https://github.com/themitchelli/LiveCalc.git libs/livecalc
git submodule update --init --recursive
```

Update `CMakeLists.txt`:

```cmake
add_subdirectory(libs/livecalc/livecalc-assumptions-lib)
target_link_libraries(your_engine PRIVATE assumptions_lib)
```

#### Option C: System Install

```bash
cd livecalc-assumptions-lib
mkdir build && cd build
cmake ..
make
sudo make install
```

Then in your `CMakeLists.txt`:

```cmake
find_package(LiveCalcAssumptionsLib REQUIRED)
target_link_libraries(your_engine PRIVATE assumptions_lib)
```

### 2. Include Headers in Your Code

```cpp
#include "c++/assumptions_client.hpp"
#include "cache/lru_cache.hpp"
#include "auth/jwt_handler.hpp"

using namespace livecalc::assumptions;
```

### 3. Initialize the Client

```cpp
// Option A: From environment variables (recommended for production)
std::string am_url = std::getenv("LIVECALC_AM_URL")
    ? std::getenv("LIVECALC_AM_URL")
    : "https://assumptionsmanager.ddns.net";
std::string jwt_token = std::getenv("LIVECALC_AM_TOKEN")
    ? std::getenv("LIVECALC_AM_TOKEN")
    : "";
std::string cache_dir = std::getenv("LIVECALC_AM_CACHE_DIR")
    ? std::getenv("LIVECALC_AM_CACHE_DIR")
    : "";  // Use OS-standard if empty

AssumptionsClient am(am_url, jwt_token, cache_dir);

// Option B: Hardcoded (for testing only)
AssumptionsClient am(
    "https://assumptionsmanager.ddns.net",
    "your-jwt-token-here",
    "/tmp/livecalc-cache"  // Optional, defaults to OS-standard
);
```

### 4. Resolve Assumptions at Engine Startup

```cpp
// Initialize assumption structures before projection begins
void initialize_assumptions(AssumptionsClient& am) {
    try {
        // Resolve full tables (for batch lookups)
        auto mortality_table = am.resolve("mortality-standard", "v2.1");
        auto lapse_table = am.resolve("lapse-standard", "v1.0");
        auto expenses = am.resolve("expenses-default", "v1.2");

        // Store in engine state for fast access during projection
        engine_state.mortality = std::move(mortality_table);
        engine_state.lapse = std::move(lapse_table);
        engine_state.expenses = std::move(expenses);

        std::cout << "Assumptions initialized successfully\n";

        // Print cache stats
        auto stats = am.get_cache_stats();
        std::cout << "Cache hits: " << stats.hits
                  << ", misses: " << stats.misses << "\n";

    } catch (const AssumptionsError& e) {
        std::cerr << "Failed to initialize assumptions: " << e.what() << "\n";
        throw;  // Fail fast if assumptions can't be resolved
    }
}
```

### 5. Use Policy Attribute Lookups During Projection

```cpp
double get_mortality_rate(
    AssumptionsClient& am,
    const Policy& policy,
    int projection_year
) {
    PolicyAttrs attrs = {
        {"age", policy.age + projection_year},
        {"gender", policy.gender},
        {"smoker", policy.smoker}
    };

    try {
        return am.resolve_scalar("mortality-standard", "v2.1", attrs);
    } catch (const AssumptionsError& e) {
        std::cerr << "Failed to resolve mortality for policy "
                  << policy.id << ": " << e.what() << "\n";
        return 0.0;  // Or use fallback logic
    }
}
```

### 6. Complete Engine Example

See `examples/cpp_engine_usage.cpp` for a full working example.

---

## Python Integration

### 1. Install the Package

#### Option A: From Source (Development)

```bash
cd livecalc-assumptions-lib
pip install -e .

# Or with dev dependencies for testing
pip install -e ".[dev]"
```

#### Option B: From Git (Production)

```bash
pip install git+https://github.com/themitchelli/LiveCalc.git#subdirectory=livecalc-assumptions-lib
```

#### Option C: From PyPI (Future)

```bash
pip install livecalc-assumptions
```

### 2. Import the Client

```python
from assumptions_client import AssumptionsClient
```

### 3. Initialize the Client

```python
import os

# Option A: From environment variables (recommended)
am = AssumptionsClient(
    am_url=os.getenv("LIVECALC_AM_URL", "https://assumptionsmanager.ddns.net"),
    jwt_token=os.getenv("LIVECALC_AM_TOKEN", ""),
    cache_dir=os.getenv("LIVECALC_AM_CACHE_DIR", "")  # OS-standard if empty
)

# Option B: Hardcoded (for testing)
am = AssumptionsClient(
    am_url="https://assumptionsmanager.ddns.net",
    jwt_token="your-jwt-token-here",
    cache_dir="/tmp/livecalc-cache"
)
```

### 4. Resolve Assumptions at Engine Startup

```python
import numpy as np

def initialize_assumptions(am: AssumptionsClient) -> dict:
    """Initialize assumptions before projection begins."""
    try:
        # Resolve full tables (returns NumPy arrays)
        assumptions = {
            'mortality': am.resolve("mortality-standard", "v2.1"),
            'lapse': am.resolve("lapse-standard", "v1.0"),
            'expenses': am.resolve("expenses-default", "v1.2")
        }

        print("Assumptions initialized successfully")

        # Print cache stats
        stats = am.get_cache_stats()
        print(f"Cache hits: {stats.hits}, misses: {stats.misses}")

        return assumptions

    except Exception as e:
        print(f"Failed to initialize assumptions: {e}")
        raise  # Fail fast if assumptions can't be resolved
```

### 5. Use Policy Attribute Lookups During Projection

```python
def get_mortality_rate(
    am: AssumptionsClient,
    policy: dict,
    projection_year: int
) -> float:
    """Get mortality rate for a specific policy and projection year."""
    attrs = {
        "age": policy["age"] + projection_year,
        "gender": policy["gender"],
        "smoker": policy["smoker"]
    }

    try:
        return am.resolve_scalar("mortality-standard", "v2.1", attrs)
    except Exception as e:
        print(f"Failed to resolve mortality for policy {policy['id']}: {e}")
        return 0.0  # Or use fallback logic
```

### 6. Complete Engine Example

See `examples/python_udf_usage.py` for a full working example including UDF integration.

---

## Python UDF Integration

For Python user-defined functions (UDFs) that customize projection logic:

```python
from assumptions_client import AssumptionsClient

# Initialize client at UDF module level (reused across calls)
am = AssumptionsClient(
    am_url=os.getenv("LIVECALC_AM_URL"),
    jwt_token=os.getenv("LIVECALC_AM_TOKEN")
)

def adjust_mortality(policy, year, lives, interest_rate):
    """UDF called by C++ engine to adjust mortality."""
    # Resolve current mortality rate
    attrs = {
        "age": policy["age"] + year,
        "gender": policy["gender"],
        "smoker": policy["smoker"]
    }

    qx = am.resolve_scalar("mortality-standard", "v2.1", attrs)

    # Apply custom logic (e.g., smoker adjustment)
    if policy.get("smoker"):
        return qx * 1.5  # 50% higher mortality for smokers

    return qx
```

---

## Environment Variables

The library uses these environment variables for configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `LIVECALC_AM_URL` | Assumptions Manager API endpoint | `https://assumptionsmanager.ddns.net` |
| `LIVECALC_AM_TOKEN` | JWT authentication token | Required |
| `LIVECALC_AM_CACHE_DIR` | Local cache directory | OS-standard (see below) |

**OS-Standard Cache Directories:**
- macOS: `~/Library/Caches/LiveCalc`
- Linux: `~/.cache/livecalc`
- Windows: `%APPDATA%\LiveCalc\Cache`

---

## Error Handling

All methods throw exceptions on error. Handle them appropriately in your engine:

### C++

```cpp
try {
    auto qx = am.resolve_scalar("mortality-standard", "v2.1", attrs);
} catch (const AssumptionsError& e) {
    // Assumption resolution failed
    std::cerr << "Assumption error: " << e.what() << "\n";
} catch (const JWTError& e) {
    // Authentication failed
    std::cerr << "Auth error: " << e.what() << "\n";
} catch (const HttpClientError& e) {
    // Network/API error
    std::cerr << "HTTP error: " << e.what() << "\n";
}
```

### Python

```python
try:
    qx = am.resolve_scalar("mortality-standard", "v2.1", attrs)
except Exception as e:
    # All errors raise standard Python exceptions
    print(f"Failed to resolve assumption: {e}")
```

---

## Thread Safety

All classes are thread-safe and can be used concurrently:

```cpp
// C++: Multiple threads can call the same client instance
#pragma omp parallel for
for (size_t i = 0; i < policies.size(); ++i) {
    auto qx = am.resolve_scalar("mortality-standard", "v2.1", policy_attrs[i]);
    // Use qx in projection...
}
```

```python
# Python: GIL prevents true parallelism, but client is still thread-safe
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor(max_workers=4) as executor:
    futures = [
        executor.submit(am.resolve_scalar, "mortality-standard", "v2.1", attrs)
        for attrs in policy_attrs
    ]
    results = [f.result() for f in futures]
```

---

## Performance Considerations

### Cache Warming

For batch processing, warm the cache before parallel execution:

```cpp
// Warm cache with all assumptions needed
am.resolve("mortality-standard", "v2.1");
am.resolve("lapse-standard", "v1.0");
am.resolve("expenses-default", "v1.2");

// Now parallel execution uses cached data
#pragma omp parallel for
for (const auto& policy : policies) {
    // Fast lookups from cache...
}
```

### Version Pinning

Always use specific versions (e.g., `"v2.1"`) in production, not `"latest"`:

```cpp
// ✅ Good: Cached immutably, fast
auto qx = am.resolve("mortality-standard", "v2.1");

// ❌ Bad: Never cached, slow, may change unexpectedly
auto qx = am.resolve("mortality-standard", "latest");
```

### Batch vs Scalar Resolution

For engines that need full tables, use `resolve()` once at startup:

```cpp
// ✅ Good: Fetch once, use locally
auto table = am.resolve("mortality-standard", "v2.1");
for (const auto& policy : policies) {
    double qx = lookup_in_table(table, policy.age, policy.gender);
}

// ❌ Bad: Fetches from cache repeatedly (still fast, but suboptimal)
for (const auto& policy : policies) {
    double qx = am.resolve_scalar("mortality-standard", "v2.1", attrs);
}
```

---

## Troubleshooting

### "AssumptionsClient not found" (C++)

**Cause:** Include path not set correctly.

**Fix:**
```cmake
target_include_directories(your_engine
    PRIVATE
    /path/to/livecalc-assumptions-lib/src
)
```

### "ModuleNotFoundError: No module named 'assumptions_client'" (Python)

**Cause:** Package not installed or not in PYTHONPATH.

**Fix:**
```bash
cd livecalc-assumptions-lib
pip install -e .
```

### "JWT token expired"

**Cause:** Token automatically refreshes, but initial token was already expired.

**Fix:** Get a fresh token from Assumptions Manager and re-initialize client.

### "Cache directory not writable"

**Cause:** Insufficient permissions for default cache directory.

**Fix:** Specify a writable directory:
```cpp
AssumptionsClient am(am_url, jwt_token, "/tmp/livecalc-cache");
```

### "Assumption not found: mortality-standard:v2.1"

**Cause:** Table doesn't exist in Assumptions Manager, or network error.

**Fix:**
1. Check if table exists: `am.list_versions("mortality-standard")`
2. Check network connectivity to AM API
3. Verify JWT token has correct permissions

---

## Example Projects

- **C++ Engine**: `examples/cpp_engine_usage.cpp` - Complete projection engine using the library
- **Python UDF**: `examples/python_udf_usage.py` - User-defined function using the library

---

## Further Reading

- [Cache Documentation](CACHE.md) - Deep dive into caching behavior
- [API Reference](../README.md#api-reference) - Full API documentation
- [LiveCalc Documentation](../../README.md) - Overall project documentation
