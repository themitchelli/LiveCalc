# LiveCalc Orchestrator

Modular orchestration layer for chaining calculation engines (C++ Projection, Python ESG, Python Solver) into a directed acyclic graph (DAG). Manages engine lifecycle, credentials, and data flow via SharedArrayBuffer for zero-copy communication within processes.

---

## Overview

The orchestrator enables composition of different calculation engines:

```
ESG Engine → Projection Engine → Solver Engine
   (Python)      (C++)             (Python)
```

**Key Features:**
- **Pluggable Engines**: All engines implement `ICalcEngine` interface
- **Zero-Copy Data Flow**: SharedArrayBuffer for inter-engine communication (no serialization)
- **Lifecycle Management**: Engine initialization, execution with timeout, cleanup
- **Credential Management**: Centralized AM JWT passing to engines
- **DAG Configuration**: JSON-based workflow definition
- **Error Handling**: Graceful failure with partial results, auto-retry support

---

## ICalcEngine Interface

All calculation engines must implement this standardized interface.

### C++ Interface

**Header:** `src/engine_interface.hpp`

```cpp
#include "engine_interface.hpp"

class ICalcEngine {
public:
    virtual ~ICalcEngine() = default;

    // Initialize with config and credentials
    virtual void initialize(
        const std::map<std::string, std::string>& config,
        const AMCredentials* credentials = nullptr
    ) = 0;

    // Get engine metadata
    virtual EngineInfo get_info() const = 0;

    // Execute computation (main execution unit)
    virtual ExecutionResult runChunk(
        const uint8_t* input_buffer,
        size_t input_size,
        uint8_t* output_buffer,
        size_t output_size
    ) = 0;

    // Clean up resources
    virtual void dispose() noexcept = 0;

    // Check if initialized
    virtual bool is_initialized() const = 0;
};
```

**Key Structures:**

```cpp
struct EngineInfo {
    std::string name;                  // "C++ Projection Engine"
    std::string version;               // "1.0.0"
    std::string engine_type;           // "projection", "esg", "solver"
    bool supports_assumptions_manager;
    size_t max_buffer_size;
};

struct ExecutionResult {
    bool success;
    double execution_time_ms;
    size_t rows_processed;
    size_t bytes_written;
    std::vector<std::string> warnings;
    std::string error_message;
};

struct AMCredentials {
    std::string am_url;
    std::string am_token;
    std::string cache_dir;
};
```

**Exceptions:**

```cpp
class CalcEngineError : public std::runtime_error {};
class InitializationError : public CalcEngineError {};
class ConfigurationError : public CalcEngineError {};
class ExecutionError : public CalcEngineError {};
```

### Python Interface

**Module:** `calc_engine_interface.py` (in each Python engine directory)

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import numpy as np

class ICalcEngine(ABC):
    @abstractmethod
    def initialize(self, config: Dict[str, Any], credentials: Optional[Dict[str, str]] = None) -> None:
        """Initialize engine with config and AM credentials"""
        pass

    @abstractmethod
    def get_info(self) -> EngineInfo:
        """Get engine metadata"""
        pass

    @abstractmethod
    def runChunk(
        self,
        input_buffer: Optional[np.ndarray],
        output_buffer: np.ndarray
    ) -> Dict[str, Any]:
        """Execute computation and write results to output buffer"""
        pass

    @abstractmethod
    def dispose(self) -> None:
        """Clean up resources"""
        pass

    @property
    @abstractmethod
    def is_initialized(self) -> bool:
        """Check if engine is initialized"""
        pass
```

---

## Implementing a New Engine

### Step 1: Implement ICalcEngine

**C++ Example:**

```cpp
#include "engine_interface.hpp"

class MyEngine : public ICalcEngine {
public:
    void initialize(
        const std::map<std::string, std::string>& config,
        const AMCredentials* credentials
    ) override {
        // Validate config
        if (config.find("required_param") == config.end()) {
            throw ConfigurationError("Missing required_param");
        }

        // Resolve assumptions from AM if credentials provided
        if (credentials && credentials->is_valid()) {
            // Use AssumptionsClient to fetch tables
        }

        initialized_ = true;
    }

    EngineInfo get_info() const override {
        return EngineInfo("My Engine", "1.0.0", "custom", true);
    }

    ExecutionResult runChunk(
        const uint8_t* input_buffer,
        size_t input_size,
        uint8_t* output_buffer,
        size_t output_size
    ) override {
        ExecutionResult result;
        auto start = std::chrono::high_resolution_clock::now();

        try {
            // Parse input buffer
            // Perform computation
            // Write results to output buffer

            result.success = true;
            result.rows_processed = ...;
            result.bytes_written = ...;
        } catch (const std::exception& e) {
            result.success = false;
            result.error_message = e.what();
        }

        auto end = std::chrono::high_resolution_clock::now();
        result.execution_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

        return result;
    }

    void dispose() noexcept override {
        try {
            // Clean up resources
            initialized_ = false;
        } catch (...) {}
    }

    bool is_initialized() const override { return initialized_; }

private:
    bool initialized_ = false;
};
```

**Python Example:**

```python
from calc_engine_interface import ICalcEngine, EngineInfo, ExecutionError
import numpy as np

class MyEngine(ICalcEngine):
    def __init__(self):
        self._initialized = False

    def initialize(self, config, credentials=None):
        # Validate config
        if 'required_param' not in config:
            raise ConfigurationError("Missing required_param")

        # Resolve assumptions from AM if credentials provided
        if credentials and credentials.get('am_url'):
            # Use AssumptionsClient
            pass

        self._initialized = True

    def get_info(self):
        return EngineInfo(
            name="My Engine",
            version="1.0.0",
            engine_type="custom",
            supports_assumptions_manager=True
        )

    def runChunk(self, input_buffer, output_buffer):
        if not self._initialized:
            raise ExecutionError("Engine not initialized")

        start_time = time.time()

        try:
            # Parse input buffer
            # Perform computation
            # Write results to output buffer

            execution_time = (time.time() - start_time) * 1000
            return {
                'execution_time_ms': execution_time,
                'rows_processed': ...,
                'warnings': []
            }
        except Exception as e:
            raise ExecutionError(f"Computation failed: {e}")

    def dispose(self):
        self._initialized = False

    @property
    def is_initialized(self):
        return self._initialized
```

### Step 2: Define Buffer Layouts

Document input and output buffer formats in your engine README:

```
Input Buffer Format (Example):
  Struct layout (24 bytes per record):
  - id: uint32_t (4 bytes)
  - value1: double (8 bytes)
  - value2: double (8 bytes)
  - padding: 4 bytes (16-byte alignment)

Output Buffer Format:
  Struct layout (16 bytes per record):
  - id: uint32_t (4 bytes)
  - result: double (8 bytes)
  - padding: 4 bytes
```

### Step 3: Register with Orchestrator

Add factory function to `engine_factory.cpp`:

```cpp
std::unique_ptr<ICalcEngine> create_my_engine() {
    return std::make_unique<MyEngine>();
}

// Register in factory map
engine_factories_["my_engine"] = create_my_engine;
```

---

## Engine Lifecycle

```
┌─────────────┐
│ Not Init    │
└──────┬──────┘
       │ initialize(config, credentials)
       ▼
┌─────────────┐
│ Initialized │◄──────────────┐
└──────┬──────┘               │
       │ runChunk()            │ (multiple times)
       ▼                       │
┌─────────────┐               │
│ Running     │───────────────┘
└──────┬──────┘
       │ dispose()
       ▼
┌─────────────┐
│ Disposed    │
└─────────────┘
```

**Lifecycle Rules:**
1. `initialize()` must be called before `runChunk()`
2. `runChunk()` can be called multiple times without re-initializing
3. `dispose()` must be called when done (frees resources)
4. After `dispose()`, `initialize()` must be called again for reuse

---

## Data Flow & Buffer Management

### Buffer Types

The orchestrator manages three types of buffers for zero-copy data exchange:

| Buffer Type | Record Size | Purpose | Max Records |
|-------------|-------------|---------|-------------|
| **INPUT** | 32 bytes | Policy data (Projection input) | 10M (320 MB) |
| **SCENARIO** | 16 bytes | Economic scenarios (ESG → Projection) | 100M (1.6 GB) |
| **RESULT** | 24 bytes | Projection results (Projection → Solver) | 100M (2.4 GB) |

### Buffer Layouts

#### INPUT Buffer (Policy Data)

```cpp
struct InputBufferRecord {     // 32 bytes, 16-byte aligned
    uint64_t policy_id;         // 0-7: Unique policy ID
    uint8_t age;                // 8: Age at entry (0-120)
    uint8_t gender;             // 9: 0=Male, 1=Female, 2=Other
    uint8_t underwriting_class; // 10: 0=Standard, 1=Smoker, etc.
    uint8_t product_type;       // 11: 0=Term, 1=Whole Life, etc.
    uint32_t padding1;          // 12-15: Alignment padding
    double sum_assured;         // 16-23: Sum assured amount
    double premium;             // 24-31: Annual premium
};
```

**Example: 10,000 policies = 320 KB**

#### SCENARIO Buffer (Economic Scenarios)

```cpp
struct ScenarioBufferRecord {  // 16 bytes, 16-byte aligned
    uint32_t scenario_id;       // 0-3: outer_id * 1000 + inner_id
    uint32_t year;              // 4-7: Projection year (1-indexed)
    double rate;                // 8-15: Interest rate (per-annum, e.g., 0.03)
};
```

**Example: 10 outer × 1K inner × 50 years = 500,000 rows = 8 MB**

#### RESULT Buffer (Projection Results)

```cpp
struct ResultBufferRecord {    // 24 bytes
    uint32_t scenario_id;       // 0-3: Scenario identifier
    uint32_t policy_id;         // 4-7: Policy identifier
    double npv;                 // 8-15: Net present value
    uint64_t padding1;          // 16-23: Reserved for future metrics
};
```

**Example: 1,000 policies × 1,000 scenarios = 1M results = 24 MB**

### BufferManager API

**Header:** `src/buffer_manager.hpp`

```cpp
#include "buffer_manager.hpp"
using namespace livecalc::orchestrator;

// Create manager
BufferManager manager;

// Allocate buffers
BufferInfo policies = manager.allocate_buffer(
    BufferType::INPUT, "policies", 10000);

BufferInfo scenarios = manager.allocate_buffer(
    BufferType::SCENARIO, "scenarios", 500000);

BufferInfo results = manager.allocate_buffer(
    BufferType::RESULT, "results", 10000000);

// Access buffer data
auto* policy_records = static_cast<InputBufferRecord*>(policies.data);
policy_records[0].policy_id = 1;
policy_records[0].sum_assured = 100000.0;

// Zero-copy sharing: Engine A writes, Engine B reads
engine_a->runChunk(nullptr, 0, scenarios.data, scenarios.total_size);
engine_b->runChunk(scenarios.data, scenarios.total_size, results.data, results.total_size);

// Query buffer stats
size_t total_allocated = manager.get_total_allocated();
auto stats = manager.get_buffer_stats();  // Map: name → size

// Cleanup (automatic on destruction)
manager.free_all();
```

### SharedArrayBuffer (Zero-Copy)

Within a single process (C++ ↔ Python), data flows via SharedArrayBuffer:

```
Engine A (Output Buffer)
    │
    │ (shared memory, no copy)
    ▼
Engine B (Input Buffer)
```

**Key Properties:**
- **16-byte alignment**: All buffers aligned for SIMD compatibility
- **Zero-copy**: Same memory address passed between engines
- **Validation**: Buffer sizes validated before allocation
- **Reusability**: Buffers reused across multiple `runChunk()` calls

**Example Workflow:**

```cpp
BufferManager manager;

// ESG Engine writes scenarios
BufferInfo scenarios = manager.allocate_buffer(BufferType::SCENARIO, "scenarios", 500000);
esg_engine->runChunk(nullptr, 0, scenarios.data, scenarios.total_size);

// Projection Engine reads scenarios (zero-copy), writes results
BufferInfo results = manager.allocate_buffer(BufferType::RESULT, "results", 1000000);
projection_engine->runChunk(
    scenarios.data, scenarios.total_size,  // Input: ESG scenarios
    results.data, results.total_size        // Output: NPVs
);

// Solver Engine reads results (zero-copy)
solver_engine->runChunk(results.data, results.total_size, final_output, final_output_size);
```

**Alignment:** All buffers are 16-byte aligned for SIMD compatibility.

### Parquet (External I/O)

For input/output to disk, use Parquet format:

```
Parquet File (Policies)
    │
    │ (orchestrator loads to buffer)
    ▼
Input Buffer → Engine → Output Buffer
                           │
                           │ (orchestrator writes)
                           ▼
                     Parquet File (Results)
```

---

## Error Handling

### Error Propagation

Engines report errors via `ExecutionResult`:

```cpp
ExecutionResult result = engine->runChunk(...);
if (!result.success) {
    std::cerr << "Engine failed: " << result.error_message << std::endl;
    // Option 1: Retry
    // Option 2: Fallback to default
    // Option 3: Fail entire pipeline
}
```

### Exceptions

Engines throw exceptions for initialization/configuration errors:

```cpp
try {
    engine->initialize(config, credentials);
} catch (const ConfigurationError& e) {
    std::cerr << "Config error: " << e.what() << std::endl;
    // Fix config and retry
} catch (const InitializationError& e) {
    std::cerr << "Init failed: " << e.what() << std::endl;
    // Check assumptions, credentials, etc.
}
```

### Graceful Failure

Engines should:
1. **Validate inputs** before processing (fail fast)
2. **Return partial results** if possible (via warnings)
3. **Never throw** from `dispose()` (must be noexcept)

---

## Credential Management

### Assumptions Manager (AM) Credentials

Orchestrator obtains AM JWT and passes to engines:

```cpp
AMCredentials creds;
creds.am_url = "https://am.example.com";
creds.am_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
creds.cache_dir = "/path/to/cache";

engine->initialize(config, &creds);
```

**Credential Sources:**
1. **VS Code Extension**: SecretStorage (encrypted)
2. **Environment Variable**: `LIVECALC_AM_TOKEN`
3. **Config File**: `am_credentials.json` (for CLI)
4. **Interactive Login**: Prompt user for credentials

**Security:**
- **Never log** tokens (redact in debug output)
- **Auto-refresh** tokens before expiry (orchestrator responsibility)
- **Pass by reference** to avoid copies

---

## Examples

See `examples/` directory for complete workflows:

- **`dag_config_projection_only.json`**: Single projection engine
- **`dag_config_esg_projection.json`**: ESG → Projection chain
- **`dag_config_full_pipeline.json`**: ESG → Projection → Solver

---

## Testing

### Unit Tests

Test each engine independently:

```cpp
TEST_CASE("ProjectionEngine initialization") {
    ProjectionEngine engine;

    std::map<std::string, std::string> config = {
        {"num_scenarios", "100"},
        {"mortality_table", "data/mortality.csv"},
        {"lapse_table", "data/lapse.csv"},
        {"expenses", "data/expenses.csv"}
    };

    REQUIRE_NOTHROW(engine.initialize(config));
    REQUIRE(engine.is_initialized());
}
```

### Integration Tests

Test engine chains:

```cpp
TEST_CASE("ESG → Projection integration") {
    // Create engines
    auto esg = std::make_unique<PythonESGEngine>();
    auto projection = std::make_unique<ProjectionEngine>();

    // Initialize
    esg->initialize(esg_config);
    projection->initialize(projection_config);

    // Allocate buffers
    uint8_t* scenario_buffer = ...;
    uint8_t* result_buffer = ...;

    // ESG generates scenarios
    ExecutionResult esg_result = esg->runChunk(nullptr, 0, scenario_buffer, scenario_size);
    REQUIRE(esg_result.success);

    // Projection uses scenarios
    ExecutionResult proj_result = projection->runChunk(scenario_buffer, scenario_size, result_buffer, result_size);
    REQUIRE(proj_result.success);
}
```

---

## Performance Considerations

### Buffer Allocation

- **Pre-allocate** buffers (avoid repeated allocation)
- **Align** to 16 bytes for SIMD compatibility
- **Reuse** buffers across multiple `runChunk()` calls

### Memory Management

- **Limit buffer sizes** (check `EngineInfo.max_buffer_size`)
- **Chunk large datasets** if total size exceeds memory
- **Free resources** with `dispose()` when done

### Parallelization

- **Multiple engines** can run in parallel (if independent)
- **Single engine** can be multi-threaded internally (engine-specific)
- **Orchestrator** handles inter-engine dependencies

---

## Roadmap

- [x] US-001: ICalcEngine Interface Definition
- [ ] US-002: SharedArrayBuffer Data Bus
- [ ] US-003: Engine Lifecycle Management
- [ ] US-004: DAG Configuration & Composition
- [ ] US-005: Credential & Authentication Management
- [ ] US-006: Parquet I/O Integration
- [ ] US-007: Execution Tracking & Logging
- [ ] US-008: Error Handling & Resilience

---

## References

- [PRD-LC-010-REVISED](../fade/prds/PRD-LC-010-REVISED-orchestration-layer.json): Full requirements
- [Python ESG Engine](../livecalc-engines/python-esg/): Example Python engine
- [Python Solver Engine](../livecalc-engines/python-solver/): Example solver engine
- [C++ Projection Engine](../livecalc-engine/): Core projection library

---

## Credential & Authentication Management

The `CredentialManager` provides centralized management of Assumptions Manager credentials with support for multiple sources and token lifecycle management.

### Credential Sources (Priority Order)

1. **Explicit credentials** (passed to constructor)
2. **Environment variables**: `LIVECALC_AM_URL`, `LIVECALC_AM_TOKEN`, `LIVECALC_AM_CACHE_DIR`
3. **Configuration file**: `~/.livecalc/credentials.json`

### Basic Usage

```cpp
#include "credential_manager.hpp"

// Option 1: Auto-discover from environment/file
CredentialManager manager;
if (manager.has_credentials()) {
    AMCredentials creds = manager.get_credentials();
    // Pass to engines...
}

// Option 2: Explicit credentials
AMCredentials explicit_creds("https://am.example.com", "jwt_token", "/cache");
CredentialManager manager(explicit_creds);

// Check source
CredentialSource source = manager.get_source();
// Returns: EXPLICIT, ENVIRONMENT, CONFIG_FILE, or NONE

// Validate credentials
bool valid = manager.validate();  // Format check
bool connected = manager.validate(true);  // Format + connectivity check

// Token refresh (if needed)
manager.refresh_if_needed();

// Safe logging (token masked)
std::cout << manager.to_string() << std::endl;
// Output: CredentialManager{source=ENVIRONMENT, url=https://am.example.com,
//         token=eyJh...ture, cache_dir=/tmp/cache, expires_in=3500s}
```

### Environment Variables

```bash
# Set credentials via environment
export LIVECALC_AM_URL="https://am.example.com"
export LIVECALC_AM_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature"
export LIVECALC_AM_CACHE_DIR="$HOME/.livecalc/cache"

# Run orchestrator (auto-loads from environment)
./livecalc-engine --config dag.json
```

### Configuration File

Create `~/.livecalc/credentials.json`:

```json
{
  "am_url": "https://am.example.com",
  "am_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
  "cache_dir": "/Users/username/.livecalc/cache"
}
```

### Token Lifecycle

```cpp
// Get token metadata
std::optional<TokenInfo> info = manager.get_token_info();
if (info && info->is_valid) {
    std::cout << "Token expires in " << info->seconds_until_expiry() << " seconds" << std::endl;

    // Check if refresh needed (5 minute threshold by default)
    if (info->needs_refresh()) {
        manager.refresh_if_needed();
    }
}

// Clear credentials (e.g., on logout)
manager.clear();

// Update credentials (e.g., after manual refresh)
AMCredentials new_creds = get_fresh_credentials();
manager.update_credentials(new_creds);
```

### Integration with Engines

```cpp
// Pass credentials to engine during initialization
CredentialManager cred_manager;
AMCredentials creds = cred_manager.get_credentials();

EngineFactory factory;
auto engine = factory.create_engine("cpp_projection");

std::map<std::string, std::string> config;
engine->initialize(config, &creds);

// Engine can now resolve assumptions from AM
```

### Security

- **No logging**: Tokens are never logged in plain text
- **Masking**: `to_string()` masks tokens (shows first/last 4 chars)
- **Memory cleanup**: Tokens cleared from memory on destruction
- **Validation**: JWT format and URL validation before use

---

## Engine Lifecycle Management

The `EngineLifecycleManager` handles engine startup, execution, and cleanup with timeout protection and error recovery.

### Basic Usage

```cpp
#include "engine_factory.hpp"
#include "engine_lifecycle.hpp"

// Create engine via factory
EngineFactory factory;
auto engine = factory.create_engine("cpp_projection");

// Configure lifecycle
LifecycleConfig config;
config.timeout_seconds = 300;        // 5 minute timeout
config.auto_retry_on_error = true;   // Retry once on transient errors
config.max_consecutive_errors = 3;   // Abort after 3 consecutive errors

// Create manager
EngineLifecycleManager manager(std::move(engine), config);

// Initialize
std::map<std::string, std::string> engine_config;
engine_config["num_scenarios"] = "1000";
engine_config["projection_years"] = "50";
AMCredentials creds("https://am.example.com", "jwt_token", "/cache");
manager.initialize(engine_config, &creds);

// Execute
ExecutionResult result = manager.run_chunk(input, input_size, output, output_size);
if (!result.success) {
    std::cerr << "Error: " << result.error_message << std::endl;
}

// Get statistics
auto stats = manager.get_stats();
std::cout << "Successful runs: " << stats.successful_runs << std::endl;
std::cout << "Average time: " << stats.average_execution_time_ms << "ms" << std::endl;

// Cleanup (automatic via RAII, or explicit)
manager.dispose();
```

### Engine States

The lifecycle manager tracks engine state through these transitions:

```
UNINITIALIZED → INITIALIZING → READY → RUNNING → [READY | ERROR | DISPOSED]
```

- **UNINITIALIZED**: Engine created but not initialized
- **INITIALIZING**: `initialize()` in progress
- **READY**: Engine initialized and ready to execute
- **RUNNING**: `runChunk()` executing
- **ERROR**: Execution failed, recovery possible
- **DISPOSED**: Resources freed, engine no longer usable

### Timeout Protection

Execution is protected by a configurable timeout:

```cpp
LifecycleConfig config;
config.timeout_seconds = 180;  // 3 minutes

EngineLifecycleManager manager(create_engine(), config);
// If execution exceeds 180 seconds, it's aborted and returns error
```

### Error Recovery

The manager supports automatic retry on transient errors:

```cpp
LifecycleConfig config;
config.auto_retry_on_error = true;
config.max_consecutive_errors = 3;

EngineLifecycleManager manager(create_engine(), config);

// If first execution fails, automatically retries once
// If 3 consecutive errors occur, engine is disposed
```

### Statistics Tracking

Track engine performance across multiple runs:

```cpp
auto stats = manager.get_stats();

std::cout << "Successful runs: " << stats.successful_runs << std::endl;
std::cout << "Failed runs: " << stats.failed_runs << std::endl;
std::cout << "Timeout count: " << stats.timeout_count << std::endl;
std::cout << "Average execution time: " << stats.average_execution_time_ms << "ms" << std::endl;
std::cout << "Total execution time: " << stats.total_execution_time_ms << "ms" << std::endl;

// Reset statistics
manager.reset_stats();
```

---

## Engine Factory

The `EngineFactory` provides centralized engine creation by type.

### Built-in Engines

```cpp
EngineFactory factory;

// Create projection engine
auto projection = factory.create_engine("cpp_projection");

// List available engine types
auto types = factory.list_engine_types();
for (const auto& type : types) {
    std::cout << "Available: " << type << std::endl;
}

// Check if engine type is registered
if (factory.is_registered("cpp_projection")) {
    // ...
}
```

### Custom Engine Registration

Register custom engine implementations:

```cpp
EngineFactory factory;

// Register custom engine
factory.register_engine("my_custom_engine", []() -> std::unique_ptr<ICalcEngine> {
    return std::make_unique<MyCustomEngine>();
});

// Create instance
auto custom = factory.create_engine("my_custom_engine");
```

---

## Implementation Status

### Completed (US-001, US-002, US-003)

- ✅ ICalcEngine interface definition (C++)
- ✅ SharedArrayBuffer data bus with typed buffers
- ✅ Engine factory with registration system
- ✅ Lifecycle management with timeout protection
- ✅ Error recovery and retry logic
- ✅ Statistics tracking
- ✅ Comprehensive test suite (32 tests, 274 assertions)

### In Progress

- ⏳ DAG configuration and composition (US-004)
- ⏳ Credential management integration (US-005)
- ⏳ Parquet I/O integration (US-006)
- ⏳ Execution tracking and logging (US-007)
- ⏳ Error handling and resilience (US-008)

