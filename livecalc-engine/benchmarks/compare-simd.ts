#!/usr/bin/env node
/**
 * SIMD vs Scalar Build Comparison Benchmark
 *
 * Compares performance between SIMD and scalar WASM builds to measure
 * the benefit of SIMD128 instructions.
 *
 * Usage:
 *   npx ts-node benchmarks/compare-simd.ts [options]
 *
 * Options:
 *   --scalar-path <path>  Path to scalar WASM module (default: ../build-wasm/livecalc.mjs)
 *   --simd-path <path>    Path to SIMD WASM module (default: ../build-wasm-simd/livecalc-simd.mjs)
 *   --output <path>       Output JSON file path
 *   --iterations <n>      Number of iterations per benchmark (default: 5)
 *   --warmup <n>          Number of warmup runs (default: 2)
 */

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import { isSimdSupported, getSimdSupportInfo } from '@livecalc/engine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// Types
// =============================================================================

interface ScenarioParams {
  initialRate: number;
  drift: number;
  volatility: number;
  minRate: number;
  maxRate: number;
}

interface BenchmarkConfig {
  name: string;
  policies: number;
  scenarios: number;
}

interface RunResult {
  executionTimeMs: number;
  meanNpv: number;
  projectionsPerSecond: number;
}

interface ComparisonResult {
  config: BenchmarkConfig;
  scalar: {
    avgTimeMs: number;
    stdDevMs: number;
    minTimeMs: number;
    maxTimeMs: number;
    avgProjectionsPerSec: number;
    meanNpv: number;
  };
  simd: {
    avgTimeMs: number;
    stdDevMs: number;
    minTimeMs: number;
    maxTimeMs: number;
    avgProjectionsPerSec: number;
    meanNpv: number;
  };
  speedup: number;
  resultsMatch: boolean;
}

interface ComparisonReport {
  timestamp: string;
  commit: string;
  branch: string;
  nodeVersion: string;
  platform: string;
  cpuModel: string;
  simdSupported: boolean;
  simdInfo: ReturnType<typeof getSimdSupportInfo>;
  iterations: number;
  warmupRuns: number;
  configs: ComparisonResult[];
  summary: {
    avgSpeedup: number;
    maxSpeedup: number;
    minSpeedup: number;
    allResultsMatch: boolean;
  };
}

// =============================================================================
// WASM Module Interface
// =============================================================================

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

// =============================================================================
// Data Generators
// =============================================================================

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

// =============================================================================
// Utilities
// =============================================================================

function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// =============================================================================
// WASM Operations
// =============================================================================

async function loadWasmModule(path: string): Promise<WasmModule> {
  const createModule = (await import(path)).default;
  return await createModule();
}

function loadCsvData(
  module: WasmModule,
  csvData: string,
  loaderFn: (ptr: number, size: number) => number
): void {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(csvData);
  const ptr = module._livecalc_malloc(bytes.length);
  if (ptr === 0) throw new Error('Failed to allocate WASM memory');

  try {
    const heap = module.HEAPU8 ?? new Uint8Array(module.wasmMemory!.buffer);
    heap.set(bytes, ptr);
    loaderFn(ptr, bytes.length);
  } finally {
    module._livecalc_free(ptr);
  }
}

function runValuation(
  module: WasmModule,
  scenarios: number,
  seed: number,
  params: ScenarioParams
): RunResult {
  const startTime = performance.now();

  module._run_valuation(
    scenarios,
    BigInt(seed),
    params.initialRate,
    params.drift,
    params.volatility,
    params.minRate,
    params.maxRate,
    1.0, 1.0, 1.0, 0
  );

  const endTime = performance.now();
  const executionTimeMs = endTime - startTime;
  const meanNpv = module._get_result_mean();

  // Calculate projections/sec based on internal engine time
  const engineTimeMs = module._get_result_execution_time_ms();

  return {
    executionTimeMs,
    meanNpv,
    projectionsPerSecond: 0, // Will be calculated with policy count
  };
}

// =============================================================================
// Benchmark Runner
// =============================================================================

async function runBenchmark(
  modulePath: string,
  config: BenchmarkConfig,
  params: ScenarioParams,
  iterations: number,
  warmupRuns: number
): Promise<{
  avgTimeMs: number;
  stdDevMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  avgProjectionsPerSec: number;
  meanNpv: number;
}> {
  const module = await loadWasmModule(modulePath);

  // Generate and load data
  const policiesCsv = generatePoliciesCsv(config.policies);
  const mortalityCsv = generateMortalityCsv();
  const lapseCsv = generateLapseCsv();
  const expensesCsv = generateExpensesCsv();

  loadCsvData(module, policiesCsv, (p, s) => module._load_policies_csv(p, s));
  loadCsvData(module, mortalityCsv, (p, s) => module._load_mortality_csv(p, s));
  loadCsvData(module, lapseCsv, (p, s) => module._load_lapse_csv(p, s));
  loadCsvData(module, expensesCsv, (p, s) => module._load_expenses_csv(p, s));

  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    runValuation(module, config.scenarios, 42 + i, params);
  }

  // Benchmark runs
  const times: number[] = [];
  let totalNpv = 0;

  for (let i = 0; i < iterations; i++) {
    const result = runValuation(module, config.scenarios, 12345 + i, params);
    times.push(result.executionTimeMs);
    totalNpv += result.meanNpv;
  }

  const avgTime = mean(times);
  const projections = config.policies * config.scenarios;

  return {
    avgTimeMs: avgTime,
    stdDevMs: stdDev(times),
    minTimeMs: Math.min(...times),
    maxTimeMs: Math.max(...times),
    avgProjectionsPerSec: (projections / avgTime) * 1000,
    meanNpv: totalNpv / iterations,
  };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  let scalarPath = resolve(__dirname, '../build-wasm/livecalc.mjs');
  let simdPath = resolve(__dirname, '../build-wasm-simd/livecalc-simd.mjs');
  let outputPath = '';
  let iterations = 5;
  let warmupRuns = 2;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--scalar-path':
        scalarPath = resolve(args[++i]);
        break;
      case '--simd-path':
        simdPath = resolve(args[++i]);
        break;
      case '--output':
        outputPath = resolve(args[++i]);
        break;
      case '--iterations':
        iterations = parseInt(args[++i], 10);
        break;
      case '--warmup':
        warmupRuns = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
SIMD vs Scalar Build Comparison Benchmark

Usage: npx ts-node benchmarks/compare-simd.ts [options]

Options:
  --scalar-path <path>  Path to scalar WASM module
  --simd-path <path>    Path to SIMD WASM module
  --output <path>       Output JSON file path
  --iterations <n>      Number of iterations per benchmark (default: 5)
  --warmup <n>          Number of warmup runs (default: 2)
  --help                Show this help message
`);
        process.exit(0);
    }
  }

  // Check prerequisites
  const simdSupported = isSimdSupported();
  const simdInfo = getSimdSupportInfo();

  console.log('='.repeat(70));
  console.log('LiveCalc SIMD vs Scalar Benchmark');
  console.log('='.repeat(70));
  console.log(`SIMD Supported: ${simdSupported}`);
  console.log(`Environment: ${simdInfo.environment}`);
  console.log(`Notes: ${simdInfo.notes}`);
  console.log();

  if (!existsSync(scalarPath)) {
    console.error(`Scalar WASM module not found: ${scalarPath}`);
    console.error('Run: cd livecalc-engine && mkdir build-wasm && cd build-wasm && emcmake cmake .. && cmake --build .');
    process.exit(1);
  }

  if (!existsSync(simdPath)) {
    console.error(`SIMD WASM module not found: ${simdPath}`);
    console.error('Run: cd livecalc-engine && mkdir build-wasm-simd && cd build-wasm-simd && emcmake cmake .. -DENABLE_SIMD=ON && cmake --build .');
    process.exit(1);
  }

  if (!simdSupported) {
    console.error('SIMD is not supported in this environment.');
    console.error('SIMD requires: Chrome 91+, Firefox 89+, Safari 16.4+, Node.js 16+');
    process.exit(1);
  }

  // Benchmark configurations
  const configs: BenchmarkConfig[] = [
    { name: 'small', policies: 1000, scenarios: 100 },
    { name: 'medium', policies: 1000, scenarios: 1000 },
    { name: 'large', policies: 10000, scenarios: 1000 },
    { name: 'scenario-heavy', policies: 1000, scenarios: 10000 },
  ];

  const params: ScenarioParams = {
    initialRate: 0.04,
    drift: 0.001,
    volatility: 0.01,
    minRate: 0.001,
    maxRate: 0.15,
  };

  console.log(`Scalar path: ${scalarPath}`);
  console.log(`SIMD path: ${simdPath}`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Warmup runs: ${warmupRuns}`);
  console.log();

  // Run benchmarks
  const results: ComparisonResult[] = [];

  for (const config of configs) {
    console.log(`\nBenchmarking: ${config.name} (${config.policies} policies × ${config.scenarios} scenarios)`);
    console.log('-'.repeat(60));

    // Run scalar benchmark
    process.stdout.write('  Scalar: ');
    const scalarResult = await runBenchmark(scalarPath, config, params, iterations, warmupRuns);
    console.log(`${scalarResult.avgTimeMs.toFixed(1)}ms ± ${scalarResult.stdDevMs.toFixed(1)}ms`);

    // Run SIMD benchmark
    process.stdout.write('  SIMD:   ');
    const simdResult = await runBenchmark(simdPath, config, params, iterations, warmupRuns);
    console.log(`${simdResult.avgTimeMs.toFixed(1)}ms ± ${simdResult.stdDevMs.toFixed(1)}ms`);

    // Calculate speedup and verify results match
    const speedup = scalarResult.avgTimeMs / simdResult.avgTimeMs;
    const resultsMatch = Math.abs(scalarResult.meanNpv - simdResult.meanNpv) < 1e-6;

    console.log(`  Speedup: ${speedup.toFixed(2)}x ${resultsMatch ? '✓' : '⚠️ Results mismatch!'}`);

    results.push({
      config,
      scalar: scalarResult,
      simd: simdResult,
      speedup,
      resultsMatch,
    });
  }

  // Generate report
  const report: ComparisonReport = {
    timestamp: new Date().toISOString(),
    commit: getGitCommit(),
    branch: getGitBranch(),
    nodeVersion: process.version,
    platform: process.platform,
    cpuModel: cpus()[0]?.model || 'unknown',
    simdSupported,
    simdInfo,
    iterations,
    warmupRuns,
    configs: results,
    summary: {
      avgSpeedup: mean(results.map(r => r.speedup)),
      maxSpeedup: Math.max(...results.map(r => r.speedup)),
      minSpeedup: Math.min(...results.map(r => r.speedup)),
      allResultsMatch: results.every(r => r.resultsMatch),
    },
  };

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`Average speedup: ${report.summary.avgSpeedup.toFixed(2)}x`);
  console.log(`Min speedup: ${report.summary.minSpeedup.toFixed(2)}x`);
  console.log(`Max speedup: ${report.summary.maxSpeedup.toFixed(2)}x`);
  console.log(`Results match: ${report.summary.allResultsMatch ? 'Yes ✓' : 'No ⚠️'}`);

  // Save output
  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);
  }

  // Exit with error if results don't match
  if (!report.summary.allResultsMatch) {
    console.error('\nERROR: SIMD and scalar builds produced different results!');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
