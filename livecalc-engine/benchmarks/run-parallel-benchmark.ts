#!/usr/bin/env node
/**
 * Parallel Benchmark for LiveCalc Engine
 *
 * Uses the actual NodeWorkerPool implementation to properly test
 * parallel execution performance.
 */

import { performance } from 'node:perf_hooks';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { NodeWorkerPool } from '@livecalc/engine';
import type { ValuationConfig, ValuationResult, ScenarioParams } from '@livecalc/engine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  _get_result_std_dev(): number;
  _get_result_execution_time_ms(): number;
  _clear_policies(): void;
  HEAPU8?: Uint8Array;
  wasmMemory?: WebAssembly.Memory;
}

const DEFAULT_SCENARIO_PARAMS: ScenarioParams = {
  initialRate: 0.04,
  drift: 0.0,
  volatility: 0.015,
  minRate: 0.01,
  maxRate: 0.10,
};

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

async function runSingleThreadedBenchmark(
  wasmPath: string,
  policyCount: number,
  scenarioCount: number,
  seed: number
): Promise<{ timeMs: number; meanNpv: number; stdDev: number }> {
  const module = await loadWasmModule(wasmPath);

  const policiesCsv = generatePoliciesCsv(policyCount);
  const mortalityCsv = generateMortalityCsv();
  const lapseCsv = generateLapseCsv();
  const expensesCsv = generateExpensesCsv();

  loadCsvData(module, policiesCsv, module._load_policies_csv.bind(module));
  loadCsvData(module, mortalityCsv, module._load_mortality_csv.bind(module));
  loadCsvData(module, lapseCsv, module._load_lapse_csv.bind(module));
  loadCsvData(module, expensesCsv, module._load_expenses_csv.bind(module));

  const startTime = performance.now();

  module._run_valuation(
    scenarioCount,
    BigInt(seed),
    DEFAULT_SCENARIO_PARAMS.initialRate,
    DEFAULT_SCENARIO_PARAMS.drift,
    DEFAULT_SCENARIO_PARAMS.volatility,
    DEFAULT_SCENARIO_PARAMS.minRate,
    DEFAULT_SCENARIO_PARAMS.maxRate,
    1.0, 1.0, 1.0,
    0
  );

  const endTime = performance.now();

  const meanNpv = module._get_result_mean();
  const stdDev = module._get_result_std_dev();

  module._clear_policies();

  return {
    timeMs: endTime - startTime,
    meanNpv,
    stdDev,
  };
}

async function runMultiThreadedBenchmark(
  wasmPath: string,
  workerPath: string,
  policyCount: number,
  scenarioCount: number,
  numWorkers: number,
  seed: number
): Promise<{ timeMs: number; result: ValuationResult }> {
  const policiesCsv = generatePoliciesCsv(policyCount);
  const mortalityCsv = generateMortalityCsv();
  const lapseCsv = generateLapseCsv();
  const expensesCsv = generateExpensesCsv();

  const pool = new NodeWorkerPool({
    numWorkers,
    workerScript: workerPath,
    wasmPath,
  });

  try {
    console.log(`    Initializing ${numWorkers} workers...`);
    const initStart = performance.now();
    await pool.initialize();
    const initTime = performance.now() - initStart;
    console.log(`    Workers initialized in ${initTime.toFixed(0)}ms`);

    console.log(`    Loading data into workers...`);
    const loadStart = performance.now();
    await pool.loadData(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
    const loadTime = performance.now() - loadStart;
    console.log(`    Data loaded in ${loadTime.toFixed(0)}ms`);

    console.log(`    Running valuation...`);
    const valuationStart = performance.now();

    const config: ValuationConfig = {
      numScenarios: scenarioCount,
      seed,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
    };

    const result = await pool.runValuation(config, (progress) => {
      if (progress % 25 === 0) {
        process.stdout.write(`\r    Progress: ${progress}%`);
      }
    });

    const valuationTime = performance.now() - valuationStart;
    console.log(`\r    Valuation completed in ${valuationTime.toFixed(0)}ms`);

    const totalTime = initTime + loadTime + valuationTime;

    return {
      timeMs: totalTime,
      result,
    };
  } finally {
    pool.terminate();
  }
}

interface BenchmarkConfig {
  name: string;
  policies: number;
  scenarios: number;
  workers: number;
}

async function runBenchmarkSuite(
  wasmPath: string,
  workerPath: string,
  configs: BenchmarkConfig[],
  seed: number
): Promise<void> {
  const results: Array<{
    config: BenchmarkConfig;
    singleMs: number;
    multiMs: number;
    speedup: number;
  }> = [];

  for (const config of configs) {
    console.log('\n' + '='.repeat(70));
    console.log(`${config.name}: ${config.policies.toLocaleString()} policies × ${config.scenarios.toLocaleString()} scenarios`);
    console.log('='.repeat(70));

    // Single-threaded
    const singleResult = await runSingleThreadedBenchmark(wasmPath, config.policies, config.scenarios, seed);
    console.log(`  Single-threaded: ${singleResult.timeMs.toFixed(0)}ms`);

    // Multi-threaded
    try {
      const multiResult = await runMultiThreadedBenchmark(
        wasmPath,
        workerPath,
        config.policies,
        config.scenarios,
        config.workers,
        seed
      );
      console.log(`  Multi-threaded:  ${multiResult.timeMs.toFixed(0)}ms (${config.workers} workers)`);

      const speedup = singleResult.timeMs / multiResult.timeMs;
      console.log(`  Speedup:         ${speedup.toFixed(2)}x`);

      results.push({
        config,
        singleMs: singleResult.timeMs,
        multiMs: multiResult.timeMs,
        speedup,
      });
    } catch (error) {
      console.log(`  Multi-threaded:  FAILED - ${error instanceof Error ? error.message : error}`);
    }
  }

  // Summary table
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('\n  Config               | Single    | Multi     | Speedup | Target');
  console.log('  ---------------------|-----------|-----------|---------|-------');

  for (const r of results) {
    const target = r.speedup >= 4 ? '✅' : '❌';
    const name = r.config.name.padEnd(20);
    const single = `${r.singleMs.toFixed(0)}ms`.padStart(9);
    const multi = `${r.multiMs.toFixed(0)}ms`.padStart(9);
    const speedup = `${r.speedup.toFixed(2)}x`.padStart(7);
    console.log(`  ${name} | ${single} | ${multi} | ${speedup} | ${target}`);
  }
}

async function main() {
  const projectRoot = resolve(__dirname, '..');
  const wasmPath = join(projectRoot, 'build-wasm', 'livecalc.mjs');
  const workerPath = join(projectRoot, 'js', 'dist', 'node-worker.mjs');

  if (!existsSync(wasmPath)) {
    console.error(`WASM module not found at: ${wasmPath}`);
    console.error('Build with: cd livecalc-engine && mkdir build-wasm && cd build-wasm && emcmake cmake .. && emmake make');
    process.exit(1);
  }

  if (!existsSync(workerPath)) {
    console.error(`Worker script not found at: ${workerPath}`);
    console.error('Build with: cd livecalc-engine/js && npm run build');
    process.exit(1);
  }

  // Check for --full flag to run comprehensive suite
  const runFull = process.argv.includes('--full');

  console.log('='.repeat(70));
  console.log('LiveCalc Parallel Execution Benchmark');
  console.log('='.repeat(70));

  const seed = 42;

  if (runFull) {
    // Full benchmark suite
    const configs: BenchmarkConfig[] = [
      { name: 'small', policies: 1000, scenarios: 100, workers: 4 },
      { name: 'medium', policies: 1000, scenarios: 1000, workers: 4 },
      { name: 'target', policies: 10000, scenarios: 1000, workers: 8 },
      { name: 'large', policies: 100000, scenarios: 1000, workers: 8 },
      { name: 'scenario-heavy', policies: 1000, scenarios: 10000, workers: 8 },
    ];

    await runBenchmarkSuite(wasmPath, workerPath, configs, seed);
    return;
  }

  // Default: single configuration benchmark
  const policyCount = 10000;
  const scenarioCount = 1000;
  const numWorkers = 8;

  console.log(`\nConfiguration:`);
  console.log(`  Policies:     ${policyCount.toLocaleString()}`);
  console.log(`  Scenarios:    ${scenarioCount.toLocaleString()}`);
  console.log(`  Workers:      ${numWorkers}`);
  console.log(`  Total projections: ${(policyCount * scenarioCount).toLocaleString()}`);

  // Single-threaded benchmark
  console.log('\n' + '='.repeat(70));
  console.log('SINGLE-THREADED BENCHMARK');
  console.log('='.repeat(70));

  const singleResult = await runSingleThreadedBenchmark(wasmPath, policyCount, scenarioCount, seed);
  const singleThroughput = (policyCount * scenarioCount) / (singleResult.timeMs / 1000);

  console.log(`\n  Time:       ${singleResult.timeMs.toFixed(0)}ms`);
  console.log(`  Throughput: ${singleThroughput.toLocaleString(undefined, { maximumFractionDigits: 0 })} proj/sec`);
  console.log(`  Mean NPV:   ${singleResult.meanNpv.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

  // Multi-threaded benchmark
  console.log('\n' + '='.repeat(70));
  console.log(`MULTI-THREADED BENCHMARK (${numWorkers} workers)`);
  console.log('='.repeat(70));

  try {
    const multiResult = await runMultiThreadedBenchmark(
      wasmPath,
      workerPath,
      policyCount,
      scenarioCount,
      numWorkers,
      seed
    );

    const multiThroughput = (policyCount * scenarioCount) / (multiResult.timeMs / 1000);

    console.log(`\n  Total time: ${multiResult.timeMs.toFixed(0)}ms`);
    console.log(`  Throughput: ${multiThroughput.toLocaleString(undefined, { maximumFractionDigits: 0 })} proj/sec`);
    console.log(`  Mean NPV:   ${multiResult.result.statistics.meanNpv.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

    // Comparison
    console.log('\n' + '='.repeat(70));
    console.log('COMPARISON');
    console.log('='.repeat(70));

    const speedup = singleResult.timeMs / multiResult.timeMs;
    const idealSpeedup = numWorkers;
    const efficiency = (speedup / idealSpeedup) * 100;

    console.log(`\n  Single-threaded:    ${singleResult.timeMs.toFixed(0)}ms`);
    console.log(`  Multi-threaded:     ${multiResult.timeMs.toFixed(0)}ms`);
    console.log(`  Speedup:            ${speedup.toFixed(2)}x (ideal: ${idealSpeedup}x)`);
    console.log(`  Parallel efficiency: ${efficiency.toFixed(1)}%`);

    if (speedup < 1) {
      console.log(`\n  ❌ REGRESSION: Multi-threaded is ${((1 - speedup) * 100).toFixed(0)}% SLOWER than single-threaded!`);
      process.exit(1);
    } else if (speedup < 4) {
      console.log(`\n  ⚠️  BELOW TARGET: Need at least 4x speedup, got ${speedup.toFixed(2)}x`);
    } else {
      console.log(`\n  ✅ TARGET MET: ${speedup.toFixed(2)}x >= 4x speedup`);
    }

    // Verify results are consistent
    const npvDiff = Math.abs(singleResult.meanNpv - multiResult.result.statistics.meanNpv);
    const npvDiffPercent = (npvDiff / Math.abs(singleResult.meanNpv)) * 100;

    if (npvDiffPercent > 1) {
      console.log(`\n  ⚠️  RESULT VARIANCE: ${npvDiffPercent.toFixed(2)}% difference in Mean NPV`);
    } else {
      console.log(`\n  ✅ Results consistent (${npvDiffPercent.toFixed(4)}% difference)`);
    }
  } catch (error) {
    console.error(`\n  ❌ MULTI-THREADED FAILED: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.error(`\n  Stack trace:\n${error.stack}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
