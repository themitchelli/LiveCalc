# Coding Standards

## Philosophy

Write code for humans first, computers second. Code should be self-documenting where possible. When the logic is ambiguous or involves non-obvious constraints, add clear comments. Respect human developers by assuming competence—don't over-comment obvious code.

## External Style Guides

We follow industry-standard style guides for each language:

- **TypeScript**: [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- **C++**: [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)
- **Python**: [PEP 8](https://peps.python.org/pep-0008/)

The conventions below extend or override these guides for LiveCalc-specific needs.

---

## Naming Conventions

### TypeScript
- **Functions/Variables**: `camelCase`
- **Classes/Interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Private members**: prefix with `_` (e.g., `_internalState`)

```typescript
const MAX_WORKERS = 16;

class WorkStealingPool {
  private _workers: Worker[];

  async runChunk(offset: number): Promise<void> {
    // ...
  }
}
```

### C++
- **Functions/Variables**: `snake_case` (matches actuarial conventions)
- **Classes/Structs**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Member variables**: `snake_case` (no prefix)

```cpp
const int MAX_PROJECTION_YEARS = 100;

class ProjectionEngine {
  double discount_factor;

  void run_projection(const Policy& policy) {
    // ...
  }
};
```

### Python
- **Everything**: `snake_case` per PEP 8
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`

```python
MAX_CONCURRENT_JOBS = 50

class JobProcessor:
    def process_batch(self, job_id: str) -> Dict[str, Any]:
        # ...
```

### Domain Terminology

Use actuarial and insurance domain terms consistently:

✅ **Prefer**: `policies`, `assumptions`, `projections`, `scenarios`, `cashflows`, `decrements`
❌ **Avoid**: `items`, `data`, `values`, `things`, `stuff`

```typescript
// Good
interface Policy {
  age: number;
  sumAssured: number;
}

// Bad
interface DataItem {
  value1: number;
  value2: number;
}
```

---

## Comments

### When to Comment

Comment on **why**, not **what**. Add comments when:

1. **Non-obvious constraints**: Explain technical requirements or limitations
2. **Algorithmic rationale**: Why this approach over alternatives
3. **Performance optimizations**: What's being optimized and why
4. **Edge cases**: Unusual scenarios that need handling
5. **TODO/FIXME**: Temporary workarounds or known issues

```typescript
// 16-byte alignment required for SIMD compatibility
const aligned = new Float64Array(sab, offset & ~15, count);

// CRC32 lookup table amortizes cost across all checksums
const crc32Table = generateLookupTable();

// TODO(PRD-LC-015): Add support for stochastic lapse rates
const lapseRate = assumptions.baseLapseRate;
```

### When NOT to Comment

Don't comment self-documenting code:

```typescript
// Bad: Obvious comment
// Increment counter by one
counter++;

// Good: No comment needed
counter++;

// Bad: Obvious comment
// Loop through all policies
for (const policy of policies) {
  // ...
}

// Good: No comment needed (or better variable name if unclear)
for (const policy of policies) {
  // ...
}
```

### Comment Style

- Use `//` for single-line comments in TypeScript/C++
- Use `#` for Python
- Use `/** ... */` for JSDoc/documentation comments
- Keep comments up-to-date when code changes

---

## LiveCalc-Specific Requirements

### SIMD Alignment

All SharedArrayBuffer allocations **must be 16-byte aligned** (not 8-byte) for SIMD compatibility.

```cpp
// C++: Use alignas
struct alignas(16) AlignedData {
  double values[100];
};

// TypeScript: Manual alignment
const alignedOffset = offset & ~15;  // Round down to nearest 16 bytes
const buffer = new Float64Array(sab, alignedOffset, count);
```

**Rationale**: 8-byte alignment causes SIMD instructions to fault on some architectures. Discovered in PRD-LC-001.

### CalcEngine Interface

All calculation engines must implement the `CalcEngine` interface:

```typescript
interface CalcEngine {
  initialize(config: EngineConfig): Promise<void>;
  runChunk(offset: number, count: number): Promise<ChunkResult>;
  dispose(): Promise<void>;
}
```

This enables pluggable engines (WASM, Python/Pyodide, Milliman Integrate) in the pipeline orchestrator.

### Error Handling

**C++/TypeScript**: Throw exceptions with descriptive messages

```cpp
if (age < 0 || age > 120) {
  throw std::out_of_range("Policy age must be 0-120, got " + std::to_string(age));
}
```

```typescript
if (!config.policyData) {
  throw new Error('Policy data is required in config');
}
```

**WASM Hot Path**: Return error codes for performance-critical functions

```cpp
// Hot path: avoid exception overhead
int run_valuation(uint32_t count, uint64_t seed) {
  if (count == 0) return ERR_INVALID_COUNT;
  // ... fast path
  return 0;  // Success
}
```

**Python**: Use exceptions, log with context

```python
try:
    result = process_job(job_id)
except Exception as e:
    logger.error(f"Job {job_id} failed: {e}", exc_info=True)
    raise
```

---

## File Organization

Organize by **feature**, not by type:

```
✅ Good (feature-based):
livecalc-vscode/src/
  pipeline/
    pipeline-orchestrator.ts
    pipeline-view.ts
    breakpoint-manager.ts
  assumptions-manager/
    auth-manager.ts
    am-client.ts
    tree-provider.ts

❌ Bad (type-based):
livecalc-vscode/src/
  models/
    pipeline.ts
    assumptions.ts
  services/
    orchestrator.ts
    auth.ts
  views/
    pipeline-view.ts
    tree.ts
```

**Rationale**: Feature-based organization keeps related code together, making it easier to understand and modify a complete feature.

---

## Type Safety

### TypeScript

Use strict mode. Avoid `any` except for genuine dynamic types.

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  }
}

// Prefer explicit types
interface JobResult {
  meanNpv: number;
  stdDev: number;
}

function processJob(id: string): JobResult {
  // ...
}

// Use unknown for truly dynamic data, then narrow
function parseResponse(data: unknown): JobResult {
  if (!isJobResult(data)) {
    throw new Error('Invalid response format');
  }
  return data;
}
```

### C++

Use modern C++ (C++17 or later). Prefer `std::optional`, `std::variant`, smart pointers.

```cpp
// Modern C++17
std::optional<double> get_lapse_rate(const Policy& policy) {
  if (!policy.has_lapse_assumption) {
    return std::nullopt;
  }
  return policy.lapse_rate;
}

// Use auto for complex types
auto results = engine.run_projection(policies);
```

### Python

Use type hints (PEP 484). Run mypy in CI.

```python
from typing import List, Dict, Optional

def process_batch(job_ids: List[str]) -> Dict[str, Optional[float]]:
    results: Dict[str, Optional[float]] = {}
    for job_id in job_ids:
        results[job_id] = compute_result(job_id)
    return results
```

---

## Performance Considerations

### Hot Paths

For performance-critical code:

1. **Minimize allocations** in tight loops
2. **Avoid exceptions** in hot paths (use error codes)
3. **Use SIMD** where applicable (must maintain 16-byte alignment)
4. **Prefer stack** over heap for small, fixed-size data

```cpp
// Hot path: projection inner loop
for (int year = 0; year < projection_years; year++) {
  // Stack allocation (fast)
  double lives_boy = lives_eoy;

  // No exceptions in loop
  double deaths = lives_boy * mortality_rates[year];
  lives_eoy = lives_boy - deaths;
}
```

### Cold Paths

For initialization, configuration, error handling:

- **Clarity over performance**: Use clear, idiomatic code
- **Exceptions are fine**: They make error handling clearer
- **Allocations are fine**: Don't prematurely optimize

```typescript
// Cold path: initialization
async initialize(config: Config): Promise<void> {
  // Exceptions OK here
  if (!config.wasmPath) {
    throw new Error('WASM path required');
  }

  // Allocations OK here
  this.workers = await Promise.all(
    Array.from({ length: this.workerCount }, () => this.createWorker())
  );
}
```

---

## Testing Considerations

Code should be testable. Avoid tight coupling to external dependencies.

### Dependency Injection

```typescript
// Testable: dependencies injected
class JobProcessor {
  constructor(
    private apiClient: ApiClient,
    private storage: StorageClient
  ) {}

  async process(jobId: string): Promise<void> {
    // ...
  }
}

// In tests: inject mocks
const processor = new JobProcessor(mockApiClient, mockStorage);
```

### Pure Functions

Prefer pure functions where possible (easier to test):

```typescript
// Pure function: easy to test
function calculateNpv(cashflows: number[], discountRates: number[]): number {
  return cashflows.reduce((sum, cf, i) => {
    const discountFactor = discountRates.slice(0, i + 1)
      .reduce((prod, r) => prod / (1 + r), 1);
    return sum + cf * discountFactor;
  }, 0);
}
```

---

## References

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)
- [PEP 8 – Style Guide for Python Code](https://peps.python.org/pep-0008/)
- [Effective Modern C++](https://www.oreilly.com/library/view/effective-modern-c/9781491908419/) by Scott Meyers
