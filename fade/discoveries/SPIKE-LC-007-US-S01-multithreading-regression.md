# Discovery: Multi-Threading Regression Root Cause and Resolution

**Date:** 2026-01-24
**Story:** SPIKE-LC-007 US-S01 - Fix Multi-Threading Regression
**Status:** RESOLVED

## Executive Summary

The reported "77% performance regression" for multi-threaded execution was caused by a broken benchmark implementation, not the actual worker pool. The `NodeWorkerPool` implementation achieves **5.5x warm speedup** and **2.6x cold speedup** on the 10K×1K target configuration, exceeding the 4x requirement.

## Root Cause Analysis

### The Reported Problem

The PRD stated: "Multi-threaded execution is 77% SLOWER than single-threaded (overhead issue)"

This was based on benchmark-2026-01-23.json which showed:
- target-single: 948ms (single-threaded, 10K policies × 1K scenarios)
- target-multi: 1680ms (reported as "8 workers")

### What Was Actually Happening

The `run-benchmarks.ts` had a broken multi-threaded implementation:

```typescript
// BROKEN: Tried to use TypeScript file as worker script
const workerFile = fileURLToPath(import.meta.url);
const worker = new Worker(workerFile, { ... });
```

Node.js workers cannot load `.ts` files directly, causing the error:
```
Unknown file extension ".ts" for /path/to/run-benchmarks.ts
```

As a result:
- `wasmMultiMs` was always `null` in the benchmark results
- Both "single" and "multi" benchmarks were actually single-threaded
- The 77% "regression" was just variance between two single-threaded runs

### The Actual Implementation

The `NodeWorkerPool` class in `@livecalc/engine` was already correctly implemented:
- Uses compiled `.mjs` worker script: `js/dist/node-worker.mjs`
- Properly distributes work across workers
- Achieves excellent parallel speedup

## The Fix

Updated `run-benchmarks.ts` to use the actual `NodeWorkerPool` implementation:

```typescript
import { NodeWorkerPool } from '@livecalc/engine';

const pool = new NodeWorkerPool({
  numWorkers,
  workerScript: workerScriptPath,  // js/dist/node-worker.mjs
  wasmPath: wasmModulePath,
});

await pool.initialize();
await pool.loadData(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
const result = await pool.runValuation(config);
```

## Performance Results

### Benchmark Results After Fix

| Configuration | Single-Thread | Multi-Thread (Cold) | Multi-Thread (Warm) |
|--------------|---------------|---------------------|---------------------|
| 10K×1K       | 937ms         | 354ms               | 166ms               |
| 100K×1K      | 9,468ms       | 3,063ms             | 2,684ms             |
| 1K×10K       | 1,642ms       | 357ms               | 180ms               |

### Speedup Analysis

| Configuration | Cold Speedup | Warm Speedup | Notes |
|--------------|--------------|--------------|-------|
| 10K×1K       | **2.6x**     | **5.6x**     | Target: 4x ✅ |
| 100K×1K      | **3.1x**     | **3.5x**     | Memory-bound at scale |
| 1K×10K       | **4.6x**     | **9.1x**     | Scenario-heavy benefits most |

### Overhead Breakdown (10K×1K)

- Worker initialization: ~170ms (one-time cost)
- Data loading: ~25ms (per-run cost, can be cached)
- Valuation: ~166ms (parallelized)

The initialization overhead explains the difference between cold (2.6x) and warm (5.6x) speedup.

## Key Insights

1. **Warm Pool is Essential**: The worker pool should be kept alive between runs
   - VS Code extension already does this via `LiveCalcEngineManager`
   - Cold start overhead (~200ms) is acceptable for first-run scenarios

2. **Scenario-Heavy Workloads Benefit Most**: 9.1x speedup for 1K×10K
   - More scenarios = more parallel work per chunk
   - Less per-worker overhead relative to computation

3. **Memory-Bound at Large Scale**: 3.5x for 100K policies
   - Data loading (210ms) becomes significant
   - Consider SharedArrayBuffer for large policy sets

4. **Target Met**: 5.6x warm speedup exceeds 4x requirement

## Files Changed

- `livecalc-engine/benchmarks/run-benchmarks.ts` - Fixed multi-thread benchmark to use NodeWorkerPool

## Recommendations

1. **For Benchmarking**: Always use warm pool timing for realistic performance comparison
2. **For Production**: Reuse worker pools between runs, don't recreate on each valuation
3. **For Large Scale**: Implement SharedArrayBuffer data sharing (SABWorkerPool)

## Verification

All performance targets now pass:
```
10K_policies_1K_scenarios_wasm_single: 927ms / 15000ms - PASS
10K_policies_1K_scenarios_wasm_8threads: 371ms / 3000ms - PASS
100K_policies_1K_scenarios_wasm_8threads: 3063ms / 30000ms - PASS
```
