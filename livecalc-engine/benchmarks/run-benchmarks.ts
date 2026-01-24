#!/usr/bin/env node
/**
 * LiveCalc Performance Benchmarking Suite
 *
 * Runs standardized benchmarks for:
 * - Native C++ (via child process)
 * - WASM single-threaded
 * - WASM multi-threaded (simulated via parallel single-threaded runs)
 *
 * Outputs results to JSON for tracking and regression detection.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { isMainThread } from 'node:worker_threads';
import { NodeWorkerPool } from '@livecalc/engine';

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
  description: string;
}

interface PerformanceTarget {
  maxTimeMs: number;
  description: string;
}

interface ConfigFile {
  version: string;
  configurations: BenchmarkConfig[];
  performanceTargets: Record<string, PerformanceTarget>;
  regressionThreshold: number;
  defaultSeed: number;
  defaultWorkers: number;
  scenarioParams: ScenarioParams;
}

interface ValuationResult {
  statistics: {
    meanNpv: number;
    stdDev: number;
    percentiles: { p50: number; p75: number; p90: number; p95: number; p99: number };
    cte95: number;
  };
  executionTimeMs: number;
  scenarioCount: number;
}

interface BenchmarkResult {
  config: BenchmarkConfig;
  nativeMs: number | null;
  wasmSingleMs: number | null;
  wasmMultiMs: number | null;
  wasmWorkers: number;
  memoryMb: number | null;
  projectionsPerSecond: number;
  policiesPerSecond: number;
  scenariosPerSecond: number;
  meanNpv: number;
  stdDev: number;
}

interface BenchmarkOutput {
  timestamp: string;
  commit: string;
  branch: string;
  nodeVersion: string;
  platform: string;
  cpuCount: number;
  cpuModel: string;
  configVersion: string;
  results: BenchmarkResult[];
  summary: {
    targetsChecked: number;
    targetsPassed: number;
    targetsFailed: string[];
    regressions: string[];
  };
}

// =============================================================================
// Utility Functions
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

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function generatePoliciesCsv(count: number): string {
  const rows: string[] = ['policy_id,age,gender,sum_assured,premium,term,product_type'];
  for (let i = 0; i < count; i++) {
    const age = 25 + (i % 40); // Ages 25-64
    const gender = i % 3 === 0 ? 'F' : 'M';
    const sumAssured = 50000 + (i % 10) * 50000; // 50K-500K
    const premium = sumAssured * 0.005 + 100;
    const term = 10 + (i % 21); // 10-30 years
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
// WASM Engine Wrapper (dynamic import to avoid build dependency)
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
  _get_result_p50(): number;
  _get_result_p75(): number;
  _get_result_p90(): number;
  _get_result_p95(): number;
  _get_result_p99(): number;
  _get_result_cte95(): number;
  _get_result_execution_time_ms(): number;
  _get_result_scenario_count(): number;
  _clear_policies(): void;
  HEAPU8?: Uint8Array;
  wasmMemory?: WebAssembly.Memory;
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

function runSingleValuation(
  module: WasmModule,
  numScenarios: number,
  seed: number,
  params: ScenarioParams
): ValuationResult {
  const result = module._run_valuation(
    numScenarios,
    BigInt(seed),
    params.initialRate,
    params.drift,
    params.volatility,
    params.minRate,
    params.maxRate,
    1.0,
    1.0,
    1.0,
    0
  );

  if (result < 0) throw new Error('Valuation failed');

  return {
    statistics: {
      meanNpv: module._get_result_mean(),
      stdDev: module._get_result_std_dev(),
      percentiles: {
        p50: module._get_result_p50(),
        p75: module._get_result_p75(),
        p90: module._get_result_p90(),
        p95: module._get_result_p95(),
        p99: module._get_result_p99(),
      },
      cte95: module._get_result_cte95(),
    },
    executionTimeMs: module._get_result_execution_time_ms(),
    scenarioCount: module._get_result_scenario_count(),
  };
}

// =============================================================================
// Benchmark Runners
// =============================================================================

async function runNativeBenchmark(
  config: BenchmarkConfig,
  nativeBinaryPath: string
): Promise<number | null> {
  if (!existsSync(nativeBinaryPath)) {
    console.log('  Native binary not found, skipping');
    return null;
  }

  try {
    const result = execSync(nativeBinaryPath, {
      encoding: 'utf-8',
      timeout: 120000,
    });

    // Parse execution time from output
    const timeMatch = result.match(/Total time:\s*(\d+(?:\.\d+)?)\s*ms/);
    if (timeMatch) {
      return parseFloat(timeMatch[1]);
    }
    return null;
  } catch (error) {
    console.log(`  Failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function runWasmSingleThreadBenchmark(
  config: BenchmarkConfig,
  wasmModulePath: string,
  scenarioParams: ScenarioParams,
  seed: number
): Promise<{ timeMs: number; result: ValuationResult; memoryMb: number | null }> {
  const module = await loadWasmModule(wasmModulePath);

  // Generate and load data
  const policiesCsv = generatePoliciesCsv(config.policies);
  const mortalityCsv = generateMortalityCsv();
  const lapseCsv = generateLapseCsv();
  const expensesCsv = generateExpensesCsv();

  loadCsvData(module, policiesCsv, module._load_policies_csv.bind(module));
  loadCsvData(module, mortalityCsv, module._load_mortality_csv.bind(module));
  loadCsvData(module, lapseCsv, module._load_lapse_csv.bind(module));
  loadCsvData(module, expensesCsv, module._load_expenses_csv.bind(module));

  const memBefore = process.memoryUsage().heapUsed;

  const result = runSingleValuation(module, config.scenarios, seed, scenarioParams);

  const memAfter = process.memoryUsage().heapUsed;
  const memoryMb = (memAfter - memBefore) / (1024 * 1024);

  module._clear_policies();

  return {
    timeMs: result.executionTimeMs,
    result,
    memoryMb: memoryMb > 0 ? memoryMb : null,
  };
}

interface MultiThreadResult {
  timeMs: number;
  warmTimeMs: number; // Time without init/load overhead
  initTimeMs: number;
  loadTimeMs: number;
  valuationTimeMs: number;
  result: ValuationResult;
  memoryMb: number | null;
}

async function runWasmMultiThreadBenchmark(
  config: BenchmarkConfig,
  wasmModulePath: string,
  workerScriptPath: string,
  scenarioParams: ScenarioParams,
  seed: number,
  numWorkers: number
): Promise<MultiThreadResult> {
  // Generate test data
  const policiesCsv = generatePoliciesCsv(config.policies);
  const mortalityCsv = generateMortalityCsv();
  const lapseCsv = generateLapseCsv();
  const expensesCsv = generateExpensesCsv();

  const memBefore = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  // Use NodeWorkerPool for proper parallel execution
  const pool = new NodeWorkerPool({
    numWorkers,
    workerScript: workerScriptPath,
    wasmPath: wasmModulePath,
  });

  try {
    const initStart = performance.now();
    await pool.initialize();
    const initTimeMs = performance.now() - initStart;

    const loadStart = performance.now();
    await pool.loadData(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
    const loadTimeMs = performance.now() - loadStart;

    const valuationStart = performance.now();
    const poolResult = await pool.runValuation({
      numScenarios: config.scenarios,
      seed,
      scenarioParams: {
        initialRate: scenarioParams.initialRate,
        drift: scenarioParams.drift,
        volatility: scenarioParams.volatility,
        minRate: scenarioParams.minRate,
        maxRate: scenarioParams.maxRate,
      },
    });
    const valuationTimeMs = performance.now() - valuationStart;

    const endTime = performance.now();
    const memAfter = process.memoryUsage().heapUsed;
    const memoryMb = (memAfter - memBefore) / (1024 * 1024);

    return {
      timeMs: endTime - startTime,
      warmTimeMs: valuationTimeMs, // Just valuation, no init/load
      initTimeMs,
      loadTimeMs,
      valuationTimeMs,
      result: {
        statistics: {
          meanNpv: poolResult.statistics.meanNpv,
          stdDev: poolResult.statistics.stdDev,
          percentiles: poolResult.statistics.percentiles,
          cte95: poolResult.statistics.cte95,
        },
        executionTimeMs: endTime - startTime,
        scenarioCount: config.scenarios,
      },
      memoryMb: memoryMb > 0 ? memoryMb : null,
    };
  } finally {
    pool.terminate();
  }
}

// =============================================================================
// Main Benchmark Runner
// =============================================================================

async function runBenchmarks(
  configPath: string,
  outputPath: string,
  baselinePath?: string,
  runNative = true,
  runSingle = true,
  runMulti = true
): Promise<BenchmarkOutput> {
  const configFile: ConfigFile = JSON.parse(readFileSync(configPath, 'utf-8'));

  console.log('LiveCalc Performance Benchmark Suite');
  console.log('====================================');
  console.log(`Config version: ${configFile.version}`);
  console.log(`Configurations: ${configFile.configurations.length}`);
  console.log(`CPU cores: ${cpus().length}`);
  console.log(`Workers: ${configFile.defaultWorkers}`);
  console.log();

  const projectRoot = resolve(__dirname, '..');
  const nativeBinaryPath = join(projectRoot, 'build', 'benchmark');
  const wasmModulePath = join(projectRoot, 'build-wasm', 'livecalc.mjs');
  const workerScriptPath = join(projectRoot, 'js', 'dist', 'node-worker.mjs');

  if (!existsSync(wasmModulePath)) {
    console.error(`WASM module not found at: ${wasmModulePath}`);
    console.error('Build with: cd livecalc-engine && mkdir build-wasm && cd build-wasm && emcmake cmake .. && emmake make');
    process.exit(1);
  }

  if (!existsSync(workerScriptPath)) {
    console.error(`Worker script not found at: ${workerScriptPath}`);
    console.error('Build with: cd livecalc-engine/js && npm run build');
    process.exit(1);
  }

  const results: BenchmarkResult[] = [];

  for (const config of configFile.configurations) {
    console.log(`\n=== ${config.name}: ${config.description} ===`);
    console.log(`Policies: ${formatNumber(config.policies)}, Scenarios: ${formatNumber(config.scenarios)}`);
    const totalProjections = config.policies * config.scenarios;
    console.log(`Total projections: ${formatNumber(totalProjections)}`);

    let nativeMs: number | null = null;
    let wasmSingleMs: number | null = null;
    let wasmMultiMs: number | null = null;
    let memoryMb: number | null = null;
    let meanNpv = 0;
    let stdDev = 0;

    // Native benchmark
    if (runNative && (config.name === 'target-single' || config.name === 'large')) {
      console.log('\nNative C++:');
      nativeMs = await runNativeBenchmark(config, nativeBinaryPath);
      if (nativeMs !== null) {
        console.log(`  Time: ${nativeMs.toFixed(0)}ms`);
      }
    }

    // WASM single-threaded
    if (runSingle) {
      console.log('\nWASM Single-thread:');
      try {
        const singleResult = await runWasmSingleThreadBenchmark(
          config,
          wasmModulePath,
          configFile.scenarioParams,
          configFile.defaultSeed
        );
        wasmSingleMs = singleResult.timeMs;
        memoryMb = singleResult.memoryMb;
        meanNpv = singleResult.result.statistics.meanNpv;
        stdDev = singleResult.result.statistics.stdDev;

        const projPerSec = totalProjections / (wasmSingleMs / 1000);
        console.log(`  Time: ${wasmSingleMs.toFixed(0)}ms`);
        console.log(`  Throughput: ${formatNumber(Math.round(projPerSec))} proj/sec`);
        if (memoryMb !== null) {
          console.log(`  Memory delta: ${memoryMb.toFixed(1)} MB`);
        }
      } catch (error) {
        console.log(`  Failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    // WASM multi-threaded
    if (runMulti) {
      console.log(`\nWASM Multi-thread (${configFile.defaultWorkers} workers):`);
      try {
        const multiResult = await runWasmMultiThreadBenchmark(
          config,
          wasmModulePath,
          workerScriptPath,
          configFile.scenarioParams,
          configFile.defaultSeed,
          configFile.defaultWorkers
        );
        wasmMultiMs = multiResult.timeMs;
        if (multiResult.memoryMb !== null && (memoryMb === null || multiResult.memoryMb > memoryMb)) {
          memoryMb = multiResult.memoryMb;
        }
        if (!runSingle) {
          meanNpv = multiResult.result.statistics.meanNpv;
          stdDev = multiResult.result.statistics.stdDev;
        }

        const projPerSec = totalProjections / (wasmMultiMs / 1000);
        console.log(`  Total time: ${wasmMultiMs.toFixed(0)}ms (init: ${multiResult.initTimeMs.toFixed(0)}ms, load: ${multiResult.loadTimeMs.toFixed(0)}ms, valuation: ${multiResult.valuationTimeMs.toFixed(0)}ms)`);
        console.log(`  Throughput: ${formatNumber(Math.round(projPerSec))} proj/sec`);

        if (wasmSingleMs !== null && wasmMultiMs > 0) {
          const coldSpeedup = wasmSingleMs / wasmMultiMs;
          const warmSpeedup = wasmSingleMs / multiResult.warmTimeMs;
          console.log(`  Speedup vs single: ${coldSpeedup.toFixed(1)}x (cold), ${warmSpeedup.toFixed(1)}x (warm - valuation only)`);
        }
      } catch (error) {
        console.log(`  Failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    const effectiveTime = wasmMultiMs ?? wasmSingleMs ?? 0;
    results.push({
      config,
      nativeMs,
      wasmSingleMs,
      wasmMultiMs,
      wasmWorkers: configFile.defaultWorkers,
      memoryMb,
      projectionsPerSecond: effectiveTime > 0 ? totalProjections / (effectiveTime / 1000) : 0,
      policiesPerSecond: effectiveTime > 0 ? config.policies / (effectiveTime / 1000) : 0,
      scenariosPerSecond: effectiveTime > 0 ? config.scenarios / (effectiveTime / 1000) : 0,
      meanNpv,
      stdDev,
    });
  }

  // Check performance targets
  console.log('\n=== Performance Target Validation ===');
  const targetsFailed: string[] = [];

  for (const [targetName, target] of Object.entries(configFile.performanceTargets)) {
    let actualTime: number | null = null;

    if (targetName.includes('single')) {
      const matchingResult = results.find(r =>
        r.config.policies === 10000 && r.config.scenarios === 1000
      );
      actualTime = matchingResult?.wasmSingleMs ?? null;
    } else if (targetName.includes('8threads')) {
      const policies = targetName.includes('100K') ? 100000 : 10000;
      const matchingResult = results.find(r =>
        r.config.policies === policies && r.config.scenarios === 1000
      );
      actualTime = matchingResult?.wasmMultiMs ?? null;
    }

    if (actualTime !== null) {
      const passed = actualTime <= target.maxTimeMs;
      const status = passed ? 'PASS' : 'FAIL';
      console.log(`${targetName}: ${actualTime.toFixed(0)}ms / ${target.maxTimeMs}ms - ${status}`);
      if (!passed) {
        targetsFailed.push(targetName);
      }
    } else {
      console.log(`${targetName}: not measured`);
    }
  }

  // Check for regressions
  const regressions: string[] = [];
  if (baselinePath && existsSync(baselinePath)) {
    console.log('\n=== Regression Detection ===');
    const baseline: BenchmarkOutput = JSON.parse(readFileSync(baselinePath, 'utf-8'));

    for (const result of results) {
      const baselineResult = baseline.results.find(r => r.config.name === result.config.name);

      if (baselineResult && result.wasmMultiMs !== null && baselineResult.wasmMultiMs !== null) {
        const change = (result.wasmMultiMs - baselineResult.wasmMultiMs) / baselineResult.wasmMultiMs;
        if (change > configFile.regressionThreshold) {
          const msg = `${result.config.name}: ${baselineResult.wasmMultiMs.toFixed(0)}ms -> ${result.wasmMultiMs.toFixed(0)}ms (+${(change * 100).toFixed(1)}%)`;
          console.log(`REGRESSION: ${msg}`);
          regressions.push(msg);
        } else {
          console.log(`${result.config.name}: ${(change * 100).toFixed(1)}% change - OK`);
        }
      }
    }
  }

  const output: BenchmarkOutput = {
    timestamp: new Date().toISOString(),
    commit: getGitCommit(),
    branch: getGitBranch(),
    nodeVersion: process.version,
    platform: process.platform,
    cpuCount: cpus().length,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    configVersion: configFile.version,
    results,
    summary: {
      targetsChecked: Object.keys(configFile.performanceTargets).length,
      targetsPassed: Object.keys(configFile.performanceTargets).length - targetsFailed.length,
      targetsFailed,
      regressions,
    },
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults written to: ${outputPath}`);

  console.log('\n=== Summary ===');
  console.log(`Targets: ${output.summary.targetsPassed}/${output.summary.targetsChecked} passed`);
  if (targetsFailed.length > 0) {
    console.log(`Failed: ${targetsFailed.join(', ')}`);
  }
  if (regressions.length > 0) {
    console.log(`Regressions: ${regressions.length}`);
  }

  return output;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  // Only run main logic in main thread
  if (!isMainThread) return;

  const args = process.argv.slice(2);

  let configPath = join(__dirname, 'benchmark-config.json');
  let outputPath = join(__dirname, 'results', `benchmark-${new Date().toISOString().slice(0, 10)}.json`);
  let baselinePath: string | undefined;
  let runNative = true;
  let runSingle = true;
  let runMulti = true;
  let ciMode = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--config':
      case '-c':
        configPath = args[++i];
        break;
      case '--output':
      case '-o':
        outputPath = args[++i];
        break;
      case '--baseline':
      case '-b':
        baselinePath = args[++i];
        break;
      case '--no-native':
        runNative = false;
        break;
      case '--no-single':
        runSingle = false;
        break;
      case '--no-multi':
        runMulti = false;
        break;
      case '--ci':
        ciMode = true;
        break;
      case '--help':
      case '-h':
        console.log(`
LiveCalc Benchmark Suite

Usage: npx tsx run-benchmarks.ts [options]

Options:
  -c, --config <path>    Path to benchmark config (default: benchmark-config.json)
  -o, --output <path>    Path for JSON output (default: results/benchmark-YYYY-MM-DD.json)
  -b, --baseline <path>  Path to baseline for regression detection
  --no-native            Skip native C++ benchmarks
  --no-single            Skip WASM single-threaded benchmarks
  --no-multi             Skip WASM multi-threaded benchmarks
  --ci                   CI mode: exit 1 on target failure or regression
  -h, --help             Show this help
        `);
        process.exit(0);
    }
  }

  try {
    const output = await runBenchmarks(
      configPath,
      outputPath,
      baselinePath,
      runNative,
      runSingle,
      runMulti
    );

    if (ciMode) {
      if (output.summary.targetsFailed.length > 0 || output.summary.regressions.length > 0) {
        console.error('\nCI mode: Failing due to target failures or regressions');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

main();
