# Testing Standards

## Test Pyramid

Maintain a healthy test distribution:

```
      /\
     /E2E\      ← 5%: Few end-to-end tests (slow, brittle)
    /------\
   /  Int   \   ← 25%: Some integration tests (medium speed)
  /----------\
 /    Unit    \ ← 70%: Many unit tests (fast, focused)
/--------------\
```

**Why**: Unit tests are fast and pinpoint failures. Integration tests verify components work together. E2E tests validate user workflows but are slow and flaky.

---

## Unit Tests

### Location

**Co-locate tests with source code.**

```
livecalc-engine/js/src/
├── calc-engine.ts
├── calc-engine.test.ts      # Same directory
├── work-stealing-pool.ts
├── work-stealing-pool.test.ts
└── orchestrator/
    ├── pipeline-orchestrator.ts
    ├── pipeline-orchestrator.test.ts
    ├── memory-manager.ts
    └── memory-manager.test.ts
```

**Python**:
```
livecalc-api/src/
├── services/
│   ├── job_service.py
│   └── job_service_test.py
```

### AAA Pattern

**Arrange, Act, Assert** for clarity:

```typescript
describe('MemoryManager', () => {
  it('should allocate 16-byte aligned offsets', () => {
    // Arrange
    const manager = new MemoryManager();
    const totalSize = 1024;

    // Act
    const offset = manager.allocate('bus://test', 100, totalSize);

    // Assert
    expect(offset % 16).toBe(0);  // 16-byte aligned
    expect(offset + 100).toBeLessThanOrEqual(totalSize);
  });
});
```

```python
def test_calculate_npv_with_varying_rates():
    # Arrange
    cashflows = [100, 100, 100]
    discount_rates = [0.05, 0.06, 0.07]

    # Act
    npv = calculate_npv(cashflows, discount_rates)

    # Assert
    expected = 100 / 1.05 + 100 / (1.05 * 1.06) + 100 / (1.05 * 1.06 * 1.07)
    assert abs(npv - expected) < 0.01
```

### Descriptive Names

**Test names should describe scenario and expected behavior.**

```typescript
// Good
it('should return empty array when no policies match filter', () => {})
it('should throw error when SAB alignment is not 16-byte', () => {})
it('should reuse worker pool across multiple runs', () => {})

// Bad
it('test1', () => {})
it('works', () => {})
it('should handle edge case', () => {})  // What edge case?
```

```python
# Good
def test_quota_enforcement_blocks_when_limit_exceeded():
    pass

def test_sas_token_expires_after_one_hour():
    pass

# Bad
def test_quota():
    pass

def test_edge_case():
    pass
```

### Fast Execution

**Unit tests should complete in < 100ms each.**

```typescript
// Fast: Pure computation
function calculateNpv(cashflows: number[], rates: number[]): number {
  // ...
}

test('calculateNpv with empty cashflows returns 0', () => {
  expect(calculateNpv([], [])).toBe(0);
});  // Runs in < 1ms

// Slow: Avoid in unit tests
test('full projection with 100K policies', async () => {
  const engine = new ProjectionEngine();
  await engine.initialize(config);  // ← Initialization slow
  const result = await engine.run(100_000);  // ← 10+ seconds
  expect(result.meanNpv).toBeGreaterThan(0);
});  // ← Move to integration test
```

**If a test is slow**, it's probably an integration test (belongs in `tests/integration/`).

### Isolated Tests

**No shared state between tests.**

```typescript
// Bad: Shared state
let sharedPool: WorkerPool;

beforeAll(() => {
  sharedPool = new WorkerPool();  // ← Shared across all tests
});

test('test1', () => {
  sharedPool.submit(job1);  // ← Affects test2
});

test('test2', () => {
  expect(sharedPool.queueSize()).toBe(0);  // ← Fails if test1 ran first
});

// Good: Isolated state
test('test1', () => {
  const pool = new WorkerPool();
  pool.submit(job1);
  expect(pool.queueSize()).toBe(1);
});

test('test2', () => {
  const pool = new WorkerPool();  // ← Fresh instance
  expect(pool.queueSize()).toBe(0);
});
```

---

## Integration Tests

### Location

**Integration tests in `tests/integration/` at project root.**

```
livecalc-api/
├── src/
│   └── services/
│       └── job_service.py
└── tests/
    ├── unit/            # Optional: if not co-located
    ├── integration/
    │   ├── test_api_endpoints.py
    │   ├── test_job_workflow.py
    │   └── test_blob_storage.py
    └── e2e/
        └── test_full_projection.py
```

### Test Component Interactions

```python
# Integration test: API → Database → Queue
async def test_submit_job_creates_database_entry_and_queue_message():
    # Arrange: Start test database and queue
    async with TestDatabase() as db, TestQueue() as queue:
        api = create_test_api(db, queue)

        # Act: Submit job via API
        response = await api.post("/v1/jobs", json={
            "policy_count": 1000,
            "scenario_count": 100,
        })

        # Assert: Verify database entry
        job_id = response.json()["job_id"]
        job = await db.get_job(job_id)
        assert job.status == "queued"

        # Assert: Verify queue message
        message = await queue.receive()
        assert message["job_id"] == job_id
```

### Use Test Doubles for External Services

```typescript
// Integration test: Extension → Mock Cloud API
describe('Cloud execution integration', () => {
  it('should upload model and receive job ID', async () => {
    // Arrange: Mock API server
    const mockServer = new MockApiServer();
    mockServer.expectUpload('/v1/bridge/upload').respondWith({
      jobId: 'test-job-123',
      status: 'queued',
    });

    // Act: Trigger cloud execution
    const config = await ConfigLoader.load();
    const result = await executeCloudRun(config, mockServer.url);

    // Assert
    expect(result.jobId).toBe('test-job-123');
    expect(mockServer.receivedRequests).toHaveLength(1);
  });
});
```

---

## Performance Benchmarks

### Benchmark Requirements

**All performance-sensitive PRDs include benchmark targets in Definition of Done.**

From SPIKE-LC-007, these are the current baseline benchmarks:

```typescript
// tests/benchmarks/projection-benchmark.test.ts
describe('Projection performance benchmarks', () => {
  it('should complete 10K×1K multi-threaded in ~370ms', async () => {
    const pool = await createWorkerPool();
    const config = generateTestConfig(10_000, 1_000);

    const start = performance.now();
    await pool.run(config);
    const duration = performance.now() - start;

    // Allow 10% variance
    expect(duration).toBeLessThan(370 * 1.1);  // < 407ms
    expect(duration).toBeGreaterThan(370 * 0.9);  // > 333ms
  });

  it('should achieve 32M+ projections/sec for 100K×1K', async () => {
    const pool = await createWorkerPool();
    const config = generateTestConfig(100_000, 1_000);

    const start = performance.now();
    await pool.run(config);
    const duration = performance.now() - start;

    const totalProjections = 100_000 * 1_000;
    const throughput = totalProjections / (duration / 1000);

    expect(throughput).toBeGreaterThan(32_000_000);  // 32M proj/sec
    expect(duration).toBeLessThan(3000 * 1.1);  // < 3.3s
  });
});
```

### Protected Benchmarks

**Current benchmarks** (maintained in regression suite):

| Config | Target Time | Throughput | Speedup |
|--------|------------|------------|---------|
| 10K × 1K single-thread | ~950ms | 10.5M proj/sec | 1.0x |
| 10K × 1K multi-thread | ~370ms | - | 5.4x |
| 100K × 1K multi-thread | ~3s | 32M proj/sec | - |
| 1M × 1K multi-thread | ~36s | 27M proj/sec | - |

**Regression tolerance**: ±10% of baseline (allows for normal variance)

```typescript
const BENCHMARK_BASELINE = {
  '10K_1K_multi': 370,
  '100K_1K_multi': 3000,
  '1M_1K_multi': 36000,
};

const TOLERANCE = 0.10;  // 10%

it('should not regress 10K×1K multi-thread performance', async () => {
  const duration = await runBenchmark('10K_1K_multi');
  const baseline = BENCHMARK_BASELINE['10K_1K_multi'];
  const maxAllowed = baseline * (1 + TOLERANCE);

  expect(duration).toBeLessThan(maxAllowed);
});
```

### Benchmark Execution

```bash
# Run benchmarks locally
npm run benchmark

# Run in CI (on performance test hardware)
# .github/workflows/performance.yml
- name: Run performance benchmarks
  run: npm run benchmark
  env:
    NODE_ENV: production
    BENCHMARK_ITERATIONS: 5

- name: Compare to baseline
  run: |
    node scripts/compare-benchmarks.js \
      --current ./benchmark-results.json \
      --baseline ./baseline-benchmarks.json \
      --tolerance 0.10
```

### Benchmark Reporting

```typescript
// Output format for trend analysis
{
  "timestamp": "2026-01-24T10:30:00Z",
  "git_sha": "a1b2c3d",
  "benchmarks": {
    "10K_1K_multi": {
      "duration_ms": 365,
      "throughput": 27_397_260,
      "speedup": 5.6,
      "baseline": 370,
      "delta_percent": -1.4
    }
  }
}
```

---

## Regression Tests

### Protect Completed PRDs

**All PRDs must maintain passing tests from previous PRDs.**

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run all tests
        run: |
          npm test -- --coverage
          python -m pytest tests/ --cov

      - name: Check coverage
        run: |
          npm run coverage-check -- --threshold 80

      - name: Run regression suite
        run: npm run test:regression
```

### Failed Regression Tests Block Merge

```yaml
# Branch protection rules
branches:
  - name: main
    protection:
      required_status_checks:
        strict: true
        contexts:
          - "test"
          - "regression"
          - "performance"
```

**When a regression fails**:

1. Investigate root cause
2. Fix the bug OR update the test (if behavior intentionally changed)
3. Document in commit message why test was updated
4. Get review/approval before merging

---

## Coverage Requirements

### Target Coverage

- **New code**: 80% line coverage
- **Critical paths**: 100% coverage (payment calculations, authorization)
- **Not a hard blocker**: Prefer meaningful tests over coverage percentage

```bash
# Configure coverage thresholds
# jest.config.js
module.exports = {
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 75,
    },
    './src/critical/': {
      lines: 100,
      functions: 100,
    },
  },
};
```

### Exclude Generated Code

```javascript
// jest.config.js
module.exports = {
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '.wasm.js',  // Emscripten-generated bindings
    '.pb.ts',    // Protobuf-generated code
  ],
};
```

---

## Test Organization

```
livecalc-vscode/
├── src/
│   ├── pipeline/
│   │   ├── orchestrator.ts
│   │   └── orchestrator.test.ts       # Unit tests (co-located)
│   └── ui/
│       ├── results-panel.ts
│       └── results-panel.test.ts
└── tests/
    ├── integration/
    │   ├── extension-activation.test.ts
    │   └── pipeline-execution.test.ts
    ├── e2e/
    │   └── full-workflow.test.ts
    └── benchmarks/
        └── projection-benchmark.test.ts
```

---

## Mocking Strategy

### Mock at Boundaries

**Mock external dependencies (file system, network), not internal business logic.**

```typescript
// Good: Mock file system
import { vol } from 'memfs';

jest.mock('fs', () => require('memfs').fs);

test('loads config from disk', async () => {
  // Arrange: Mock file system
  vol.fromJSON({
    '/config/livecalc.config.json': '{"policies": 1000}',
  });

  // Act
  const config = await ConfigLoader.load('/config/livecalc.config.json');

  // Assert
  expect(config.policies).toBe(1000);
});

// Bad: Mock internal logic
jest.mock('./calculate-npv');  // ← Don't mock your own business logic

test('projection calculates NPV', () => {
  calculateNpv.mockReturnValue(1000);  // ← Meaningless test
  const result = runProjection();
  expect(result.npv).toBe(1000);
});
```

### Mock HTTP Clients

```python
# Good: Mock HTTP client
@patch('requests.post')
def test_submit_job_to_api(mock_post):
    # Arrange
    mock_post.return_value = Mock(
        status_code=200,
        json=lambda: {"job_id": "test-123"}
    )

    # Act
    job_id = submit_job_to_cloud(config)

    # Assert
    assert job_id == "test-123"
    mock_post.assert_called_once()
```

---

## E2E Tests

### Minimal E2E Coverage

**E2E tests are slow and brittle. Test critical user workflows only.**

```typescript
// tests/e2e/full-projection-workflow.test.ts
describe('Full projection workflow', () => {
  it('should execute projection and display results', async () => {
    // Arrange: Start VS Code with extension loaded
    const vscode = await launchVSCode();
    await vscode.openWorkspace('/test-workspace');

    // Act: Trigger run command
    await vscode.executeCommand('livecalc.run');

    // Wait for results
    await vscode.waitForElement('.results-panel', { timeout: 10000 });

    // Assert: Results displayed
    const meanNpv = await vscode.getText('.results-panel .mean-npv');
    expect(parseFloat(meanNpv)).toBeGreaterThan(0);
  });
});
```

**Characteristics**:
- Run in isolated environment (Docker container, clean VM)
- Use test data (not production)
- Longer timeouts (E2E operations are slow)
- Run nightly or pre-release (not on every commit)

---

## Test Checklist

Before merging:

- [ ] Unit tests for new functions/classes
- [ ] Integration tests for new component interactions
- [ ] Benchmarks updated if performance-critical code changed
- [ ] All regression tests passing
- [ ] Coverage meets threshold (80%)
- [ ] Tests have descriptive names
- [ ] No shared state between tests
- [ ] Mocks used appropriately (boundaries only)
- [ ] E2E test added if user-facing workflow changed

---

## References

- [Jest Testing Guide](https://jestjs.io/docs/getting-started)
- [pytest Documentation](https://docs.pytest.org/)
- [Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Google Testing Blog](https://testing.googleblog.com/)
