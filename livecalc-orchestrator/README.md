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
- **Credential Management**: Centralized AM JWT passing to engines
- **DAG Configuration**: JSON-based workflow definition
- **Error Handling**: Graceful failure with partial results

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

### SharedArrayBuffer (Zero-Copy)

Within a single process (C++ ↔ Python), data flows via SharedArrayBuffer:

```
Engine A (Output Buffer)
    │
    │ (shared memory, no copy)
    ▼
Engine B (Input Buffer)
```

**Orchestrator allocates buffers:**

```cpp
// Allocate input and output buffers
size_t input_size = 1000 * 32;   // 1000 policies × 32 bytes
size_t output_size = 1000 * 16;  // 1000 results × 16 bytes

uint8_t* input_buffer = allocate_aligned_buffer(input_size);
uint8_t* output_buffer = allocate_aligned_buffer(output_size);

// Engine A writes to output_buffer
engine_a->runChunk(nullptr, 0, output_buffer, output_size);

// Engine B reads from output_buffer (now input for B)
engine_b->runChunk(output_buffer, output_size, final_output, final_output_size);
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
