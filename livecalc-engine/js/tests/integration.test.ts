/**
 * Integration tests for LiveCalcEngine with actual WASM module
 *
 * These tests load the real WASM module and verify end-to-end functionality.
 * Run with: npm test -- tests/integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LiveCalcEngine, DEFAULT_SCENARIO_PARAMS } from '../src/index.js';
import type { CreateLiveCalcModule } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to WASM build
const WASM_DIR = join(__dirname, '../../build-wasm');
const DATA_DIR = join(__dirname, '../../data');

// Load sample data files
const loadSampleData = () => ({
  policies: readFileSync(join(DATA_DIR, 'sample_policies.csv'), 'utf-8'),
  mortality: readFileSync(join(DATA_DIR, 'sample_mortality.csv'), 'utf-8'),
  lapse: readFileSync(join(DATA_DIR, 'sample_lapse.csv'), 'utf-8'),
  expenses: readFileSync(join(DATA_DIR, 'sample_expenses.csv'), 'utf-8'),
});

// Check if WASM module exists
const wasmModuleExists = (): boolean => {
  try {
    readFileSync(join(WASM_DIR, 'livecalc.mjs'));
    return true;
  } catch {
    return false;
  }
};

// Skip integration tests if WASM module not built
const describeIfWasmExists = wasmModuleExists() ? describe : describe.skip;

describeIfWasmExists('LiveCalcEngine Integration', () => {
  let engine: LiveCalcEngine;
  let createModule: CreateLiveCalcModule;
  let sampleData: ReturnType<typeof loadSampleData>;

  beforeAll(async () => {
    // Dynamically import the WASM module
    const wasmModule = await import(join(WASM_DIR, 'livecalc.mjs'));
    createModule = wasmModule.default;

    // Load sample data
    sampleData = loadSampleData();

    // Create and initialize engine
    engine = new LiveCalcEngine();
    await engine.initialize(createModule);
  });

  afterAll(() => {
    engine.dispose();
  });

  it('should load policies from CSV', () => {
    const count = engine.loadPoliciesFromCsv(sampleData.policies);
    expect(count).toBe(10); // sample_policies.csv has 10 policies
  });

  it('should load mortality from CSV', () => {
    expect(() => engine.loadMortalityFromCsv(sampleData.mortality)).not.toThrow();
  });

  it('should load lapse from CSV', () => {
    expect(() => engine.loadLapseFromCsv(sampleData.lapse)).not.toThrow();
  });

  it('should load expenses from CSV', () => {
    expect(() => engine.loadExpensesFromCsv(sampleData.expenses)).not.toThrow();
  });

  it('should report ready after loading all data', () => {
    expect(engine.isReady).toBe(true);
  });

  it('should run valuation and return valid statistics', () => {
    const result = engine.runValuation({
      numScenarios: 100,
      seed: 42,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
      storeDistribution: true, // Need to store distribution to get scenario count
    });

    // Check result structure
    expect(result.statistics).toBeDefined();
    expect(result.statistics.meanNpv).toBeDefined();
    expect(result.statistics.stdDev).toBeDefined();
    expect(result.statistics.percentiles).toBeDefined();
    expect(result.statistics.cte95).toBeDefined();
    expect(result.executionTimeMs).toBeGreaterThan(0);
    expect(result.scenarioCount).toBe(100);

    // Verify statistics are reasonable numbers
    expect(Number.isFinite(result.statistics.meanNpv)).toBe(true);
    expect(Number.isFinite(result.statistics.stdDev)).toBe(true);
    expect(result.statistics.stdDev).toBeGreaterThanOrEqual(0);

    // Verify percentile ordering
    const { percentiles } = result.statistics;
    expect(percentiles.p50).toBeLessThanOrEqual(percentiles.p75);
    expect(percentiles.p75).toBeLessThanOrEqual(percentiles.p90);
    expect(percentiles.p90).toBeLessThanOrEqual(percentiles.p95);
    expect(percentiles.p95).toBeLessThanOrEqual(percentiles.p99);
  });

  it('should return distribution when requested', () => {
    const result = engine.runValuation({
      numScenarios: 50,
      seed: 123,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
      storeDistribution: true,
    });

    expect(result.distribution).toBeDefined();
    expect(result.distribution!.length).toBe(50);

    // All values should be finite numbers
    result.distribution!.forEach((npv) => {
      expect(Number.isFinite(npv)).toBe(true);
    });
  });

  it('should produce reproducible results with same seed', () => {
    const config = {
      numScenarios: 100,
      seed: 12345,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
    };

    const result1 = engine.runValuation(config);
    const result2 = engine.runValuation(config);

    expect(result1.statistics.meanNpv).toBe(result2.statistics.meanNpv);
    expect(result1.statistics.stdDev).toBe(result2.statistics.stdDev);
    expect(result1.statistics.cte95).toBe(result2.statistics.cte95);
  });

  it('should produce different results with different seeds', () => {
    const result1 = engine.runValuation({
      numScenarios: 100,
      seed: 111,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
    });

    const result2 = engine.runValuation({
      numScenarios: 100,
      seed: 222,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
    });

    // Results should differ (with very high probability)
    expect(result1.statistics.meanNpv).not.toBe(result2.statistics.meanNpv);
  });

  it('should apply mortality multiplier', () => {
    const baseResult = engine.runValuation({
      numScenarios: 100,
      seed: 42,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
      mortalityMultiplier: 1.0,
    });

    const stressedResult = engine.runValuation({
      numScenarios: 100,
      seed: 42,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
      mortalityMultiplier: 1.5,
    });

    // Higher mortality should increase death claims and reduce NPV
    // (assuming policies are profitable)
    expect(stressedResult.statistics.meanNpv).not.toBe(
      baseResult.statistics.meanNpv
    );
  });

  it('should return valid JSON result', () => {
    engine.runValuation({
      numScenarios: 50,
      seed: 42,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
      storeDistribution: true, // Need to store distribution for scenario_count in JSON
    });

    const json = engine.getResultJson();
    expect(typeof json).toBe('string');

    // Should be valid JSON
    const parsed = JSON.parse(json);
    expect(parsed.statistics).toBeDefined();
    expect(parsed.statistics.mean_npv).toBeDefined();
    expect(parsed.execution_time_ms).toBeDefined();
    expect(parsed.scenario_count).toBe(50);
  });

  it('should return version string', () => {
    const version = engine.getVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should handle clearing policies', () => {
    // First run works
    expect(engine.isReady).toBe(true);

    // Clear policies
    engine.clearPolicies();

    // Now missing policies
    expect(engine.isReady).toBe(false);

    // Reload policies
    engine.loadPoliciesFromCsv(sampleData.policies);
    expect(engine.isReady).toBe(true);
  });
});
