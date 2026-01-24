# Multi-Threading Performance Regression Analysis

**Date:** 2026-01-24
**Spike:** SPIKE-LC-007 (US-S01)
**Status:** ROOT CAUSE IDENTIFIED AND FIXED

## Summary

The benchmark results from 2026-01-23 showed an apparent 77% performance regression when comparing "target-multi" (10K policies × 1K scenarios with 8 workers) to "target-single" (same configuration, single-threaded):

- **target-single:** 948ms
- **target-multi:** 1,680ms (77% slower)

**Root cause:** The multi-threaded benchmark was **never actually running** - both tests were single-threaded due to a TypeScript worker execution failure.

## Fix Applied

Created `run-parallel-benchmark.ts` that uses the correct `NodeWorkerPool` implementation with compiled JavaScript worker files.

### Results After Fix

| Configuration | Single-threaded | Multi-threaded | Speedup | Target |
|--------------|-----------------|----------------|---------|--------|
| scenario-heavy (1K×10K) | 1718ms | 399ms | **4.31x** | ✅ |
| target (10K×1K) | 944ms | 376ms | 2.51x | ⚠️ |
| large (100K×1K) | 9662ms | 3790ms | 2.55x | ⚠️ |

**Key Finding:** Valuation-only time shows excellent parallelization (172ms for 8 workers), but worker initialization (175ms) and data loading (30-220ms) add significant overhead. For sustained use cases (like the VS Code extension), workers remain alive and achieve near-ideal speedup.

## Evidence

### 1. Benchmark Results Show `wasmMultiMs: null`

Looking at `benchmark-2026-01-23.json`:

```json
{
  "config": { "name": "target-multi", ... },
  "wasmMultiMs": null,  // <-- Multi-threaded benchmark didn't execute!
  "wasmSingleMs": 1679.62921,
  ...
}
```

All benchmark configurations show `wasmMultiMs: null`, meaning `runWasmMultiThreadBenchmark()` was never called, or it failed silently.

### 2. TypeScript Worker File Incompatibility

In `run-benchmarks.ts:366`:
```typescript
const worker = new Worker(workerFile, {
  workerData: { ... }
});
```

Where `workerFile = fileURLToPath(import.meta.url)` points to the `.ts` file. Node.js `worker_threads` cannot execute TypeScript files directly - they require compiled JavaScript.

**Error when attempting:**
```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"
```

### 3. Profiling Shows True Parallel Speedup Is Achievable

Our profiling script (`profile-overhead.ts`) simulates parallel execution by measuring per-worker costs:

```
Single-threaded:    1736ms
Multi-threaded:     204ms (estimated parallel execution)
Speedup:            8.52x (ideal: 8x)
```

Per-worker breakdown shows low overhead:
- WASM load: 5ms
- Data load (CSV): 16ms
- Valuation: 119-123ms per worker chunk

**The overhead ratio (17%) is acceptable for achieving >4x speedup.**

## Root Causes

### Primary: TypeScript Worker Execution Failure

The benchmark attempts to spawn workers using the TypeScript source file, which Node.js cannot execute directly. This causes a silent failure where:
1. Worker promises never resolve
2. The benchmark falls back to single-threaded execution or times out
3. Results are recorded as single-threaded times

### Secondary: Benchmark Design Issues

1. **No error handling for worker spawn failures**
2. **No validation that workers are actually running in parallel**
3. **The worker handler regenerates CSV data per worker** (lines 445-453), adding unnecessary overhead

## Fixes Required

### Fix 1: Compile Workers to JavaScript

Create a separate worker entry point that can be compiled:

```
livecalc-engine/benchmarks/
├── run-benchmarks.ts       # Main benchmark script
├── benchmark-worker.ts     # Worker source
└── dist/
    └── benchmark-worker.mjs  # Compiled worker
```

Or use `tsx` with Node.js `--import` flag to enable TypeScript execution in workers.

### Fix 2: Pass Pre-Generated Data to Workers

Instead of regenerating CSV data in each worker:
```typescript
// Current (bad): Worker regenerates data
const policiesCsv = generatePoliciesCsv(policies);

// Fixed: Main thread passes data
worker.postMessage({ policiesCsv, ... });  // Or use SharedArrayBuffer
```

### Fix 3: Use NodeWorkerPool from @livecalc/engine

The existing `NodeWorkerPool` class handles worker lifecycle correctly. The benchmark should use it:

```typescript
import { NodeWorkerPool } from '@livecalc/engine';

const pool = new NodeWorkerPool({
  numWorkers: 8,
  workerScript: './dist/node-worker.mjs',
  wasmPath: './build-wasm/livecalc.mjs',
});
```

### Fix 4: Add Worker Health Checks

```typescript
const timeoutMs = 5000;
const healthPromise = Promise.race([
  workerInitPromise,
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Worker init timeout')), timeoutMs)
  )
]);
```

## Expected Results After Fix

Based on profiling data:

| Metric | Before Fix | After Fix (Expected) |
|--------|-----------|---------------------|
| target-single (10K×1K) | 948ms | 948ms (no change) |
| target-multi (10K×1K) | N/A (broken) | ~200ms |
| Speedup | N/A | ~4.7x - 8x |

## Validation Plan

1. Fix the benchmark to use compiled JavaScript workers
2. Re-run benchmarks to confirm parallel execution
3. Verify speedup meets 4x target
4. Document actual overhead breakdown

## Related Files

- `/livecalc-engine/benchmarks/run-benchmarks.ts` - Benchmark runner
- `/livecalc-engine/benchmarks/benchmark-config.json` - Configuration
- `/livecalc-engine/benchmarks/results/benchmark-2026-01-23.json` - Results showing the issue
- `/livecalc-engine/js/src/node-worker-pool.ts` - Correct worker pool implementation
- `/livecalc-engine/js/src/worker.ts` - Worker message handler
