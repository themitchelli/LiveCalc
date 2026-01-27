# API Reference

Complete API reference for the LiveCalc Assumptions Library (C++ and Python).

---

## C++ API

### namespace livecalc::assumptions

All C++ classes and types are within this namespace.

---

## AssumptionsClient

Main client class for resolving assumptions from the Assumptions Manager API.

### Constructor

```cpp
AssumptionsClient(
    const std::string& am_url,
    const std::string& jwt_token,
    const std::string& cache_dir = ""
)
```

**Parameters:**
- `am_url` - Assumptions Manager API endpoint URL
- `jwt_token` - JWT authentication token
- `cache_dir` - Local cache directory (optional, uses OS-standard if empty)

**Throws:**
- `AssumptionsError` - If initialization fails

**Example:**
```cpp
AssumptionsClient am(
    "https://assumptionsmanager.ddns.net",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "/tmp/livecalc-cache"
);
```

---

### resolve()

Resolves a full assumption table.

```cpp
std::vector<double> resolve(
    const std::string& name,
    const std::string& version
)
```

**Parameters:**
- `name` - Table name (e.g., "mortality-standard")
- `version` - Version string (e.g., "v2.1", "latest", "draft")

**Returns:**
- Flat vector of table data in row-major order

**Throws:**
- `AssumptionsError` - If table not found or resolution fails

**Caching:**
- Version-specific requests (e.g., "v2.1") are cached immutably
- "latest" and "draft" are never cached (always fetch fresh)

**Example:**
```cpp
auto mortality = am.resolve("mortality-standard", "v2.1");
// Returns: [qx_age0_M, qx_age0_F, qx_age1_M, qx_age1_F, ...]
```

---

### resolve_scalar()

Resolves a single value based on policy attributes.

```cpp
double resolve_scalar(
    const std::string& name,
    const std::string& version,
    const PolicyAttrs& policy_attrs
)
```

**Parameters:**
- `name` - Table name
- `version` - Version string
- `policy_attrs` - Map of policy attributes for lookup

**Returns:**
- Scalar value (qx, lapse rate, expense, etc.)

**Throws:**
- `AssumptionsError` - If table not found, required attribute missing, or out of bounds

**PolicyAttrs Type:**
```cpp
using PolicyAttrs = std::map<std::string, std::variant<int, double, std::string>>;
```

**Example:**
```cpp
PolicyAttrs attrs = {
    {"age", 50},
    {"gender", std::string("M")},
    {"smoker", 0}
};

double qx = am.resolve_scalar("mortality-standard", "v2.1", attrs);
// Returns: e.g., 0.0032 (0.32% mortality rate for 50-year-old male non-smoker)
```

---

### list_versions()

Lists available versions for a table.

```cpp
std::vector<std::string> list_versions(const std::string& name)
```

**Parameters:**
- `name` - Table name

**Returns:**
- Vector of version strings (e.g., ["v1.0", "v2.0", "v2.1"])

**Throws:**
- `AssumptionsError` - If table not found

**Example:**
```cpp
auto versions = am.list_versions("mortality-standard");
for (const auto& v : versions) {
    std::cout << v << "\n";
}
// Output:
// v1.0
// v2.0
// v2.1
```

---

### get_cache_stats()

Returns cache statistics.

```cpp
CacheStats get_cache_stats() const
```

**Returns:**
- `CacheStats` struct with hit/miss counts, size, and entry count

**Example:**
```cpp
auto stats = am.get_cache_stats();
std::cout << "Hits: " << stats.hits << "\n";
std::cout << "Misses: " << stats.misses << "\n";
std::cout << "Size: " << stats.bytes_stored << " bytes\n";
std::cout << "Entries: " << stats.entries_count << "\n";
```

---

## CacheStats

Cache statistics structure.

```cpp
struct CacheStats {
    size_t hits;           // Number of cache hits
    size_t misses;         // Number of cache misses
    size_t bytes_stored;   // Total bytes in cache
    size_t entries_count;  // Number of cache entries
};
```

---

## LRUCache

Low-level cache class (used internally by AssumptionsClient).

### Constructor

```cpp
LRUCache(
    const std::string& cache_dir = "",
    size_t max_size_mb = 500
)
```

**Parameters:**
- `cache_dir` - Cache directory (optional, uses OS-standard if empty)
- `max_size_mb` - Maximum cache size in megabytes

---

### get()

Retrieves entry from cache.

```cpp
bool get(const std::string& key, std::vector<double>& data)
```

**Parameters:**
- `key` - Cache key (format: "table-name:version")
- `data` - Output vector for retrieved data

**Returns:**
- `true` if found, `false` if not in cache

---

### put()

Stores entry in cache.

```cpp
void put(
    const std::string& key,
    const std::string& version,
    const std::vector<double>& data
)
```

**Parameters:**
- `key` - Cache key
- `version` - Version string (for metadata)
- `data` - Data to cache

---

### is_cacheable()

Checks if a key should be cached.

```cpp
static bool is_cacheable(const std::string& key)
```

**Parameters:**
- `key` - Cache key to check

**Returns:**
- `true` if cacheable (not "latest" or "draft"), `false` otherwise

---

### clear()

Clears all cache entries.

```cpp
void clear()
```

---

## JWTHandler

JWT token management class.

### Constructor (Token-based)

```cpp
JWTHandler(
    const std::string& am_url,
    const std::string& token
)
```

**Parameters:**
- `am_url` - Assumptions Manager API endpoint
- `token` - Existing JWT token

---

### Constructor (Credentials-based)

```cpp
JWTHandler(
    const std::string& am_url,
    const std::string& username,
    const std::string& password
)
```

**Parameters:**
- `am_url` - Assumptions Manager API endpoint
- `username` - Username for authentication
- `password` - Password for authentication

---

### get_token()

Returns current token, auto-refreshing if expiring.

```cpp
std::string get_token()
```

**Returns:**
- Current JWT token

**Throws:**
- `JWTError` - If token refresh fails

**Refresh Behavior:**
- Automatically refreshes if token expires in < 5 minutes
- Thread-safe for concurrent calls

---

### token_expires_in()

Returns seconds until token expiry.

```cpp
int token_expires_in() const
```

**Returns:**
- Seconds until expiry, or -1 if already expired

---

### refresh_token()

Forces token refresh.

```cpp
void refresh_token()
```

**Throws:**
- `JWTError` - If refresh fails

---

## Exception Classes

### AssumptionsError

```cpp
class AssumptionsError : public std::runtime_error {
    // Thrown when assumption resolution fails
};
```

**Common Causes:**
- Table not found
- Version not found
- Required policy attribute missing
- Network/API error

---

### JWTError

```cpp
class JWTError : public std::runtime_error {
    // Thrown when authentication fails
};
```

**Common Causes:**
- Invalid token
- Expired token (and refresh failed)
- Invalid credentials

---

### HttpClientError

```cpp
class HttpClientError : public std::runtime_error {
    // Thrown when HTTP communication fails
};
```

**Common Causes:**
- Network timeout
- Server error (500-599)
- Connection refused

---

## Python API

### class AssumptionsClient

Main client class for resolving assumptions (Python).

#### Constructor

```python
AssumptionsClient(
    am_url: str,
    jwt_token: str,
    cache_dir: str = ""
)
```

**Parameters:**
- `am_url` - Assumptions Manager API endpoint URL
- `jwt_token` - JWT authentication token
- `cache_dir` - Local cache directory (optional, uses OS-standard if empty)

**Raises:**
- `Exception` - If initialization fails

**Example:**
```python
am = AssumptionsClient(
    "https://assumptionsmanager.ddns.net",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "/tmp/livecalc-cache"
)
```

---

#### resolve()

Resolves a full assumption table.

```python
def resolve(
    self,
    name: str,
    version: str
) -> Union[np.ndarray, List[float]]
```

**Parameters:**
- `name` - Table name
- `version` - Version string

**Returns:**
- NumPy array of table data (if numpy installed) or list

**Raises:**
- `Exception` - If table not found or resolution fails

**Example:**
```python
import numpy as np

mortality = am.resolve("mortality-standard", "v2.1")
# Returns: np.array([qx_age0_M, qx_age0_F, qx_age1_M, ...])
```

---

#### resolve_scalar()

Resolves a single value based on policy attributes.

```python
def resolve_scalar(
    self,
    name: str,
    version: str,
    policy_attrs: dict
) -> float
```

**Parameters:**
- `name` - Table name
- `version` - Version string
- `policy_attrs` - Dictionary of policy attributes

**Returns:**
- Scalar value (float)

**Raises:**
- `Exception` - If table not found, attribute missing, or out of bounds

**Example:**
```python
qx = am.resolve_scalar(
    "mortality-standard",
    "v2.1",
    {"age": 50, "gender": "M", "smoker": False}
)
# Returns: e.g., 0.0032
```

---

#### list_versions()

Lists available versions for a table.

```python
def list_versions(self, name: str) -> List[str]
```

**Parameters:**
- `name` - Table name

**Returns:**
- List of version strings

**Example:**
```python
versions = am.list_versions("mortality-standard")
# Returns: ["v1.0", "v2.0", "v2.1"]
```

---

#### get_cache_stats()

Returns cache statistics.

```python
def get_cache_stats(self) -> CacheStats
```

**Returns:**
- `CacheStats` dataclass with hit/miss counts, size, and entry count

**Example:**
```python
stats = am.get_cache_stats()
print(f"Hits: {stats.hits}, Misses: {stats.misses}")
print(f"Size: {stats.bytes_stored} bytes")
print(f"Entries: {stats.entries}")
```

---

### class CacheStats

Cache statistics dataclass (Python).

```python
@dataclass
class CacheStats:
    hits: int           # Number of cache hits
    misses: int         # Number of cache misses
    bytes_stored: int   # Total bytes in cache
    entries: int        # Number of cache entries
```

---

## Type Reference

### C++ Types

```cpp
// Policy attributes for scalar lookups
using PolicyAttrs = std::map<std::string, std::variant<int, double, std::string>>;

// Cache statistics
struct CacheStats {
    size_t hits;
    size_t misses;
    size_t bytes_stored;
    size_t entries_count;
};
```

### Python Types

```python
# Policy attributes type hint
PolicyAttrs = Dict[str, Union[int, float, str, bool]]

# Cache statistics
@dataclass
class CacheStats:
    hits: int
    misses: int
    bytes_stored: int
    entries: int
```

---

## Usage Patterns

### Pattern 1: Initialize Once, Use Many Times

```cpp
// C++
AssumptionsClient am(am_url, jwt_token);
auto mortality = am.resolve("mortality-standard", "v2.1");

// Use in hot loop (lookups from cached table)
for (const auto& policy : policies) {
    double qx = lookup_in_table(mortality, policy.age, policy.gender);
}
```

```python
# Python
am = AssumptionsClient(am_url, jwt_token)
mortality = am.resolve("mortality-standard", "v2.1")

# Use in hot loop
for policy in policies:
    qx = lookup_in_table(mortality, policy["age"], policy["gender"])
```

---

### Pattern 2: Policy-Specific Lookups

```cpp
// C++
for (const auto& policy : policies) {
    PolicyAttrs attrs = {
        {"age", policy.age},
        {"gender", policy.gender},
        {"smoker", policy.smoker}
    };
    double qx = am.resolve_scalar("mortality-standard", "v2.1", attrs);
}
```

```python
# Python
for policy in policies:
    qx = am.resolve_scalar(
        "mortality-standard",
        "v2.1",
        {"age": policy["age"], "gender": policy["gender"], "smoker": policy["smoker"]}
    )
```

---

### Pattern 3: Version Discovery

```cpp
// C++
auto versions = am.list_versions("mortality-standard");
std::string latest_version = versions.back();  // Assumes sorted
auto table = am.resolve("mortality-standard", latest_version);
```

```python
# Python
versions = am.list_versions("mortality-standard")
latest_version = versions[-1]  # Assumes sorted
table = am.resolve("mortality-standard", latest_version)
```

---

## Error Handling Best Practices

### Fail Fast

```cpp
// Fail at engine initialization if assumptions can't be resolved
try {
    auto assumptions = initialize_assumptions(am);
} catch (const AssumptionsError& e) {
    std::cerr << "Fatal: Cannot initialize assumptions: " << e.what() << "\n";
    return 1;  // Exit immediately
}
```

### Graceful Degradation

```cpp
// Use fallback logic during projection if lookup fails
try {
    double qx = am.resolve_scalar("mortality-standard", "v2.1", attrs);
} catch (const AssumptionsError& e) {
    std::cerr << "Warning: Using fallback mortality for policy " << policy.id << "\n";
    double qx = 0.01;  // Conservative fallback
}
```

### Retry Logic

```cpp
// Retry with exponential backoff (handled internally by HttpClient)
// No manual retry needed - library handles transient errors automatically
auto table = am.resolve("mortality-standard", "v2.1");
```

---

## Thread Safety Guarantees

All classes are **thread-safe** for concurrent use:

- **AssumptionsClient**: Multiple threads can call `resolve()` and `resolve_scalar()` concurrently
- **JWTHandler**: Token refresh is synchronized
- **LRUCache**: All cache operations are protected by mutex

**Example (OpenMP):**
```cpp
#pragma omp parallel for
for (size_t i = 0; i < policies.size(); ++i) {
    // Safe: Multiple threads calling the same client
    double qx = am.resolve_scalar("mortality-standard", "v2.1", attrs[i]);
}
```

---

## Performance Characteristics

| Operation | Time Complexity | Notes |
|-----------|----------------|-------|
| `resolve()` (cache hit) | O(1) | Direct memory read |
| `resolve()` (cache miss) | O(n) | Network fetch + write to cache |
| `resolve_scalar()` (cache hit) | O(log m) | Binary search or hash lookup in cached table |
| `resolve_scalar()` (cache miss) | O(n) | Network fetch + lookup |
| `list_versions()` | O(k) | API call, k = number of versions |

**Where:**
- n = network latency + table size
- m = table size
- k = number of versions

**Optimization Tips:**
1. Use specific versions (e.g., "v2.1") not "latest" for better caching
2. Warm cache at startup with all needed tables
3. Use batch `resolve()` for full tables when possible, not repeated `resolve_scalar()` calls
