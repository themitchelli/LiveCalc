#!/usr/bin/env node
/**
 * Profile Worker Pool Overhead
 *
 * Measures the breakdown of time spent in different phases:
 * 1. Worker initialization (spawning workers)
 * 2. WASM module loading (per worker)
 * 3. Data generation (CSV creation)
 * 4. Data transfer (postMessage to workers)
 * 5. Data loading (CSV parsing in WASM)
 * 6. Valuation execution
 * 7. Result aggregation
 *
 * This script simulates multi-threaded behavior without actual worker threads
 * to profile the per-worker overhead that would occur.
 */

import { performance } from 'node:perf_hooks';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Timings {
  workerSpawn: number;
  wasmLoad: number;
  dataGen: number;
  dataTransfer: number;
  dataLoad: number;
  valuation: number;
  resultTransfer: number;
  aggregation: number;
}

interface WasmModule {
  _livecalc_malloc(size: number): number;
  _livecalc_free(ptr: number): void;
  _load_policies_csv(ptr: number, size: number): number;
  _load_mortality_csv(ptr: number, size: number): number;
  _load_lapse_csv(ptr: number, size: number): number;
  _load_expenses_csv(ptr: number, size: number): number;
  _run_valuation(
    numScenarios: number,
    seed: bigint,
    initialRate: number,
    drift: number,
    volatility: number,
    minRate: number,
    maxRate: number,
    mortalityMult: number,
    lapseMult: number,
    expenseMult: number,
    storeDistribution: number
  ): number;
  _get_result_mean(): number;
  _get_result_execution_time_ms(): number;
  _clear_policies(): void;
  HEAPU8?: Uint8Array;
  wasmMemory?: WebAssembly.Memory;
}

function generatePoliciesCsv(count: number): string {
  const rows: string[] = ['policy_id,age,gender,sum_assured,premium,term,product_type'];
  for (let i = 0; i < count; i++) {
    const age = 25 + (i % 40);
    const gender = i % 3 === 0 ? 'F' : 'M';
    const sumAssured = 50000 + (i % 10) * 50000;
    const premium = sumAssured * 0.005 + 100;
    const term = 10 + (i % 21);
    rows.push(`${i + 1},${age},${gender},${sumAssured},${premium.toFixed(0)},${term},Term`);
  }
  return rows.join('\n');
}

function generateMortalityCsv(): string {
  const rows: string[] = ['age,male_qx,female_qx'];
  for (let age = 0; age <= 120; age++) {
    const maleQx = Math.min(1.0, 0.0001 + 0.00001 * age * age);
    const femaleQx = maleQx * 0.7;
    rows.push(`${age},${maleQx.toFixed(8)},${femaleQx.toFixed(8)}`);
  }
  return rows.join('\n');
}

function generateLapseCsv(): string {
  const rates = [
    0.15, 0.12, 0.10, 0.08, 0.07, 0.06, 0.05, 0.04, 0.04, 0.03,
    0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03,
    0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03,
    0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03,
    0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03,
  ];
  const rows: string[] = ['year,lapse_rate'];
  for (let year = 1; year <= 50; year++) {
    rows.push(`${year},${rates[year - 1]}`);
  }
  return rows.join('\n');
}

function generateExpensesCsv(): string {
  return `parameter,value
per_policy_acquisition,500
per_policy_maintenance,50
percent_of_premium,0.05
claim_expense,100`;
}

async function loadWasmModule(wasmPath: string): Promise<WasmModule> {
  const createModule = (await import(wasmPath)).default;
  return await createModule();
}

function loadCsvData(
  module: WasmModule,
  csvData: string,
  loaderFn: (ptr: number, size: number) => number
): number {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(csvData);
  const ptr = module._livecalc_malloc(bytes.length);
  if (ptr === 0) throw new Error('Failed to allocate WASM memory');

  try {
    const heap = module.HEAPU8 ?? new Uint8Array(module.wasmMemory!.buffer);
    heap.set(bytes, ptr);
    return loaderFn(ptr, bytes.length);
  } finally {
    module._livecalc_free(ptr);
  }
}

async function profileSingleThreaded(
  wasmPath: string,
  policyCount: number,
  scenarioCount: number
): Promise<{ total: number; breakdown: Timings }> {
  const timings: Timings = {
    workerSpawn: 0,
    wasmLoad: 0,
    dataGen: 0,
    dataTransfer: 0,
    dataLoad: 0,
    valuation: 0,
    resultTransfer: 0,
    aggregation: 0,
  };

  // Data generation
  const dataGenStart = performance.now();
  const policiesCsv = generatePoliciesCsv(policyCount);
  const mortalityCsv = generateMortalityCsv();
  const lapseCsv = generateLapseCsv();
  const expensesCsv = generateExpensesCsv();
  timings.dataGen = performance.now() - dataGenStart;

  // WASM load
  const wasmLoadStart = performance.now();
  const module = await loadWasmModule(wasmPath);
  timings.wasmLoad = performance.now() - wasmLoadStart;

  // Data load
  const dataLoadStart = performance.now();
  loadCsvData(module, policiesCsv, module._load_policies_csv.bind(module));
  loadCsvData(module, mortalityCsv, module._load_mortality_csv.bind(module));
  loadCsvData(module, lapseCsv, module._load_lapse_csv.bind(module));
  loadCsvData(module, expensesCsv, module._load_expenses_csv.bind(module));
  timings.dataLoad = performance.now() - dataLoadStart;

  // Valuation
  const valuationStart = performance.now();
  module._run_valuation(
    scenarioCount,
    BigInt(42),
    0.04, 0.0, 0.015, 0.01, 0.10,
    1.0, 1.0, 1.0,
    0
  );
  timings.valuation = performance.now() - valuationStart;

  module._clear_policies();

  const total = timings.dataGen + timings.wasmLoad + timings.dataLoad + timings.valuation;
  return { total, breakdown: timings };
}

/**
 * Simulates multi-threaded overhead by measuring per-worker costs sequentially.
 * This gives us accurate timing for what each worker would experience.
 */
async function profileSimulatedMultiThreaded(
  wasmPath: string,
  policyCount: number,
  scenarioCount: number,
  numWorkers: number
): Promise<{ total: number; breakdown: Timings; perWorkerTimes: number[] }> {
  const timings: Timings = {
    workerSpawn: 0,
    wasmLoad: 0,
    dataGen: 0,
    dataTransfer: 0,
    dataLoad: 0,
    valuation: 0,
    resultTransfer: 0,
    aggregation: 0,
  };

  // Data generation (main thread - happens once)
  const dataGenStart = performance.now();
  const policiesCsv = generatePoliciesCsv(policyCount);
  const mortalityCsv = generateMortalityCsv();
  const lapseCsv = generateLapseCsv();
  const expensesCsv = generateExpensesCsv();
  timings.dataGen = performance.now() - dataGenStart;

  const scenariosPerWorker = Math.ceil(scenarioCount / numWorkers);
  const perWorkerTimes: number[] = [];

  // Measure what each worker would do (sequentially to get accurate timing)
  let maxWasmLoad = 0;
  let maxDataLoad = 0;
  let maxValuation = 0;

  console.log(`\n  Simulating ${numWorkers} workers (sequential measurement):`);

  for (let i = 0; i < numWorkers; i++) {
    const workerScenarios = Math.min(scenariosPerWorker, scenarioCount - i * scenariosPerWorker);
    if (workerScenarios <= 0) continue;

    const workerStart = performance.now();

    // Each worker loads WASM independently
    const wasmLoadStart = performance.now();
    const module = await loadWasmModule(wasmPath);
    const wasmLoadTime = performance.now() - wasmLoadStart;
    maxWasmLoad = Math.max(maxWasmLoad, wasmLoadTime);

    // Each worker parses CSV data independently (simulates postMessage transfer + parsing)
    const dataLoadStart = performance.now();
    loadCsvData(module, policiesCsv, module._load_policies_csv.bind(module));
    loadCsvData(module, mortalityCsv, module._load_mortality_csv.bind(module));
    loadCsvData(module, lapseCsv, module._load_lapse_csv.bind(module));
    loadCsvData(module, expensesCsv, module._load_expenses_csv.bind(module));
    const dataLoadTime = performance.now() - dataLoadStart;
    maxDataLoad = Math.max(maxDataLoad, dataLoadTime);

    // Each worker runs its scenario chunk
    const valuationStart = performance.now();
    module._run_valuation(
      workerScenarios,
      BigInt(42 + i),
      0.04, 0.0, 0.015, 0.01, 0.10,
      1.0, 1.0, 1.0,
      0
    );
    const valuationTime = performance.now() - valuationStart;
    maxValuation = Math.max(maxValuation, valuationTime);

    module._clear_policies();

    const workerTotal = performance.now() - workerStart;
    perWorkerTimes.push(workerTotal);

    console.log(`    Worker ${i}: ${workerTotal.toFixed(0)}ms (wasm: ${wasmLoadTime.toFixed(0)}, data: ${dataLoadTime.toFixed(0)}, valuation: ${valuationTime.toFixed(0)})`);
  }

  timings.wasmLoad = maxWasmLoad;
  timings.dataLoad = maxDataLoad;
  timings.valuation = maxValuation;

  // In true parallel execution, total time would be the max worker time (critical path)
  // plus some overhead for worker spawn and result aggregation
  const estimatedSpawnOverhead = 50; // Approximate worker spawn time in Node.js
  const estimatedAggregation = 5;
  timings.workerSpawn = estimatedSpawnOverhead;
  timings.aggregation = estimatedAggregation;

  // The total time in parallel would be approximately the max of per-worker times
  const maxWorkerTime = Math.max(...perWorkerTimes);
  const total = timings.dataGen + estimatedSpawnOverhead + maxWorkerTime + estimatedAggregation;

  return { total, breakdown: timings, perWorkerTimes };
}

async function main() {
  const projectRoot = resolve(__dirname, '..');
  const wasmPath = join(projectRoot, 'build-wasm', 'livecalc.mjs');

  if (!existsSync(wasmPath)) {
    console.error(`WASM module not found at: ${wasmPath}`);
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('Worker Pool Overhead Profiling');
  console.log('='.repeat(70));

  const policyCount = 10000;
  const scenarioCount = 1000;
  const numWorkers = 8;

  console.log(`\nConfiguration:`);
  console.log(`  Policies:  ${policyCount.toLocaleString()}`);
  console.log(`  Scenarios: ${scenarioCount.toLocaleString()}`);
  console.log(`  Workers:   ${numWorkers}`);
  console.log(`  Total projections: ${(policyCount * scenarioCount).toLocaleString()}`);

  // Single-threaded profile
  console.log('\n' + '='.repeat(70));
  console.log('SINGLE-THREADED PROFILE');
  console.log('='.repeat(70));

  const single = await profileSingleThreaded(wasmPath, policyCount, scenarioCount);
  console.log(`\n  Total time: ${single.total.toFixed(0)}ms`);
  console.log(`\n  Breakdown:`);
  console.log(`    Data generation:  ${single.breakdown.dataGen.toFixed(0)}ms (${(single.breakdown.dataGen / single.total * 100).toFixed(1)}%)`);
  console.log(`    WASM load:        ${single.breakdown.wasmLoad.toFixed(0)}ms (${(single.breakdown.wasmLoad / single.total * 100).toFixed(1)}%)`);
  console.log(`    Data load (CSV):  ${single.breakdown.dataLoad.toFixed(0)}ms (${(single.breakdown.dataLoad / single.total * 100).toFixed(1)}%)`);
  console.log(`    Valuation:        ${single.breakdown.valuation.toFixed(0)}ms (${(single.breakdown.valuation / single.total * 100).toFixed(1)}%)`);

  const singleThroughput = (policyCount * scenarioCount) / (single.total / 1000);
  console.log(`\n  Throughput: ${singleThroughput.toLocaleString(undefined, { maximumFractionDigits: 0 })} proj/sec`);

  // Simulated multi-threaded profile
  console.log('\n' + '='.repeat(70));
  console.log(`MULTI-THREADED PROFILE (${numWorkers} workers) - SIMULATED`);
  console.log('='.repeat(70));

  const multi = await profileSimulatedMultiThreaded(wasmPath, policyCount, scenarioCount, numWorkers);
  console.log(`\n  Estimated parallel wall-clock time: ${multi.total.toFixed(0)}ms`);
  console.log(`\n  Critical path (max per-phase):`);
  console.log(`    Data generation:  ${multi.breakdown.dataGen.toFixed(0)}ms`);
  console.log(`    Worker spawn:     ${multi.breakdown.workerSpawn.toFixed(0)}ms (estimated)`);
  console.log(`    WASM load (max):  ${multi.breakdown.wasmLoad.toFixed(0)}ms`);
  console.log(`    Data load (max):  ${multi.breakdown.dataLoad.toFixed(0)}ms`);
  console.log(`    Valuation (max):  ${multi.breakdown.valuation.toFixed(0)}ms`);

  const multiThroughput = (policyCount * scenarioCount) / (multi.total / 1000);
  console.log(`\n  Throughput: ${multiThroughput.toLocaleString(undefined, { maximumFractionDigits: 0 })} proj/sec`);

  // Comparison
  console.log('\n' + '='.repeat(70));
  console.log('COMPARISON');
  console.log('='.repeat(70));

  const speedup = single.total / multi.total;
  const idealSpeedup = numWorkers;
  const efficiency = (speedup / idealSpeedup) * 100;

  console.log(`\n  Single-threaded:    ${single.total.toFixed(0)}ms`);
  console.log(`  Multi-threaded:     ${multi.total.toFixed(0)}ms (estimated)`);
  console.log(`  Speedup:            ${speedup.toFixed(2)}x (ideal: ${idealSpeedup}x)`);
  console.log(`  Parallel efficiency: ${efficiency.toFixed(1)}%`);

  if (speedup < 1) {
    console.log(`\n  ⚠️  REGRESSION: Multi-threaded is ${((1 - speedup) * 100).toFixed(0)}% SLOWER than single-threaded!`);
  } else if (speedup < 4) {
    console.log(`\n  ⚠️  BELOW TARGET: Need at least 4x speedup, got ${speedup.toFixed(2)}x`);
  } else {
    console.log(`\n  ✅ TARGET MET: ${speedup.toFixed(2)}x >= 4x speedup`);
  }

  // Root cause analysis
  console.log('\n' + '='.repeat(70));
  console.log('ROOT CAUSE ANALYSIS');
  console.log('='.repeat(70));

  // Calculate ideal parallel time (just valuation parallelized, everything else shared)
  const idealParallelTime = single.breakdown.dataGen + single.breakdown.wasmLoad +
    single.breakdown.dataLoad + (single.breakdown.valuation / numWorkers);
  const idealSpeedupAchievable = single.total / idealParallelTime;

  console.log(`\n  Ideal scenario (shared data, parallel valuation only):`);
  console.log(`    Expected time: ${idealParallelTime.toFixed(0)}ms`);
  console.log(`    Achievable speedup: ${idealSpeedupAchievable.toFixed(2)}x`);

  console.log(`\n  Current scenario (duplicated setup per worker):`);
  console.log(`    Each worker independently:`);
  console.log(`      - Loads WASM module: ${multi.breakdown.wasmLoad.toFixed(0)}ms`);
  console.log(`      - Parses CSV data:   ${multi.breakdown.dataLoad.toFixed(0)}ms`);
  console.log(`      - Runs valuation:    ${multi.breakdown.valuation.toFixed(0)}ms`);

  const perWorkerOverhead = multi.breakdown.wasmLoad + multi.breakdown.dataLoad;
  const perWorkerValuation = multi.breakdown.valuation;

  console.log(`\n  Per-worker overhead: ${perWorkerOverhead.toFixed(0)}ms`);
  console.log(`  Per-worker valuation: ${perWorkerValuation.toFixed(0)}ms`);
  console.log(`  Overhead ratio: ${(perWorkerOverhead / perWorkerValuation * 100).toFixed(0)}%`);

  if (perWorkerOverhead > perWorkerValuation) {
    console.log(`\n  ❌ CRITICAL: Overhead (${perWorkerOverhead.toFixed(0)}ms) > Valuation (${perWorkerValuation.toFixed(0)}ms)`);
    console.log(`     Workers spend more time setting up than computing!`);
  }

  // Recommendations
  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(70));

  console.log(`\n  ROOT CAUSE: Each worker duplicates ${perWorkerOverhead.toFixed(0)}ms of setup work`);
  console.log(`              that should be done once and shared.\n`);

  console.log(`  1. ✅ WASM Module Caching (saves ${multi.breakdown.wasmLoad.toFixed(0)}ms per worker)`);
  console.log(`     - Keep worker pool alive between valuations`);
  console.log(`     - Pre-load WASM once per worker on initialization`);
  console.log(`     - Only reload policies/assumptions, not WASM module`);

  console.log(`\n  2. ✅ SharedArrayBuffer for Policies (saves ${multi.breakdown.dataLoad.toFixed(0)}ms per worker)`);
  console.log(`     - Parse CSV once on main thread`);
  console.log(`     - Store policies in SharedArrayBuffer`);
  console.log(`     - Workers read directly from shared memory (zero-copy)`);
  console.log(`     - SABWorkerPool already implements this!`);

  console.log(`\n  3. ✅ Binary Format Instead of CSV`);
  console.log(`     - Pre-serialize policies to binary format`);
  console.log(`     - Workers just memcpy to WASM, no parsing`);
  console.log(`     - Further reduces per-worker data load time`);

  console.log(`\n  EXPECTED AFTER FIXES:`);
  console.log(`     - Parallel time: ~${idealParallelTime.toFixed(0)}ms`);
  console.log(`     - Speedup: ~${idealSpeedupAchievable.toFixed(1)}x`);

  // Additional insight: current benchmark behavior
  console.log('\n' + '='.repeat(70));
  console.log('BENCHMARK ANALYSIS');
  console.log('='.repeat(70));

  console.log(`\n  Looking at benchmark-2026-01-23.json results:`);
  console.log(`    target-single: 948ms (single-threaded, 1K scenarios)`);
  console.log(`    target-multi:  1680ms (8 workers, still single-threaded per benchmark!)`);

  console.log(`\n  The benchmark shows 77% regression because:`);
  console.log(`    1. Both benchmarks run SINGLE-THREADED valuations`);
  console.log(`    2. Multi-threaded spawns 8 workers but wasmMultiMs is NULL`);
  console.log(`    3. target-multi uses different CSV generation (more data?)`);
  console.log(`       or has other overhead not present in target-single`);

  console.log(`\n  To get actual parallel speedup:`);
  console.log(`    - Fix WorkerPool to actually parallelize work`);
  console.log(`    - Use SABWorkerPool for zero-copy data sharing`);
  console.log(`    - Warm up workers before timing begins`);
}

main().catch(console.error);
