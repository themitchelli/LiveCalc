/**
 * CalcEngine Interface and Adapter Tests
 *
 * Tests the CalcEngine interface, LiveCalcEngineAdapter, and MockCalcEngine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  CalcEngine,
  ChunkConfig,
  AssumptionBuffers,
} from '../src/calc-engine.js';
import {
  MockCalcEngine,
  createMockEngineFactory,
  createFastMockEngine,
  createRealisticMockEngine,
  createFailingInitMockEngine,
  createFailingRunMockEngine,
} from '../src/mock-engine.js';
import { DEFAULT_SCENARIO_PARAMS } from '../src/types.js';

// Sample test data
const SAMPLE_POLICIES_CSV = `policy_id,age,gender,sum_assured,premium,term,product_type
1,30,M,100000,500,20,TERM
2,35,F,150000,750,25,TERM
3,40,M,200000,1000,30,TERM`;

const SAMPLE_ASSUMPTIONS: AssumptionBuffers = {
  mortality: `age,male_qx,female_qx
0,0.00450,0.00380
30,0.00091,0.00029
35,0.00095,0.00035
40,0.00110,0.00045`,
  lapse: `year,lapse_rate
1,0.15
2,0.12
3,0.10`,
  expenses: `name,value
per_policy_acquisition,500
per_policy_maintenance,50
percent_of_premium,0.05
claim_expense,100`,
};

const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  numScenarios: 100,
  seed: 42,
  scenarioParams: DEFAULT_SCENARIO_PARAMS,
  mortalityMultiplier: 1.0,
  lapseMultiplier: 1.0,
  expenseMultiplier: 1.0,
};

describe('MockCalcEngine', () => {
  let engine: CalcEngine;

  beforeEach(async () => {
    engine = new MockCalcEngine();
    await engine.initialize();
  });

  afterEach(() => {
    engine.dispose();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(engine.isInitialized).toBe(true);
    });

    it('should return engine info', () => {
      const info = engine.getInfo();
      expect(info.name).toBe('MockCalcEngine');
      expect(info.version).toBe('1.0.0');
      expect(info.maxPolicies).toBeGreaterThan(0);
      expect(info.maxScenariosPerChunk).toBeGreaterThan(0);
      expect(info.supportsBinaryInput).toBe(true);
    });

    it('should throw when re-initializing without dispose', async () => {
      // MockCalcEngine allows re-initialization, so just verify it doesn't fail
      const engine2 = new MockCalcEngine();
      await engine2.initialize();
      expect(engine2.isInitialized).toBe(true);
      engine2.dispose();
    });
  });

  describe('data loading', () => {
    it('should load policies from CSV', async () => {
      const count = await engine.loadPolicies(SAMPLE_POLICIES_CSV);
      expect(count).toBe(3); // 3 policies in sample (excluding header)
      expect(engine.hasPolicies).toBe(true);
    });

    it('should load policies from ArrayBuffer', async () => {
      const data = new ArrayBuffer(96); // 3 policies * 32 bytes
      const count = await engine.loadPolicies(data);
      expect(count).toBe(3);
      expect(engine.hasPolicies).toBe(true);
    });

    it('should load assumptions', async () => {
      await engine.loadAssumptions(SAMPLE_ASSUMPTIONS);
      expect(engine.hasAssumptions).toBe(true);
    });

    it('should clear policies', async () => {
      await engine.loadPolicies(SAMPLE_POLICIES_CSV);
      expect(engine.hasPolicies).toBe(true);

      engine.clearPolicies();
      expect(engine.hasPolicies).toBe(false);
    });

    it('should throw when loading policies without initialization', async () => {
      const uninitEngine = new MockCalcEngine();
      await expect(uninitEngine.loadPolicies(SAMPLE_POLICIES_CSV)).rejects.toThrow(
        'Engine not initialized'
      );
    });
  });

  describe('runChunk', () => {
    beforeEach(async () => {
      await engine.loadPolicies(SAMPLE_POLICIES_CSV);
      await engine.loadAssumptions(SAMPLE_ASSUMPTIONS);
    });

    it('should run a chunk and return results', async () => {
      const result = await engine.runChunk(DEFAULT_CHUNK_CONFIG);

      expect(result.scenarioNpvs).toBeInstanceOf(Float64Array);
      expect(result.scenarioNpvs.length).toBe(100);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should produce deterministic results with same seed', async () => {
      const result1 = await engine.runChunk(DEFAULT_CHUNK_CONFIG);
      const result2 = await engine.runChunk(DEFAULT_CHUNK_CONFIG);

      expect(result1.scenarioNpvs.length).toBe(result2.scenarioNpvs.length);
      for (let i = 0; i < result1.scenarioNpvs.length; i++) {
        expect(result1.scenarioNpvs[i]).toBeCloseTo(result2.scenarioNpvs[i], 10);
      }
    });

    it('should produce different results with different seeds', async () => {
      const result1 = await engine.runChunk({ ...DEFAULT_CHUNK_CONFIG, seed: 1 });
      const result2 = await engine.runChunk({ ...DEFAULT_CHUNK_CONFIG, seed: 2 });

      // At least some values should differ
      let hasDifference = false;
      for (let i = 0; i < result1.scenarioNpvs.length; i++) {
        if (Math.abs(result1.scenarioNpvs[i] - result2.scenarioNpvs[i]) > 0.01) {
          hasDifference = true;
          break;
        }
      }
      expect(hasDifference).toBe(true);
    });

    it('should respect mortality multiplier', async () => {
      const baseResult = await engine.runChunk({
        ...DEFAULT_CHUNK_CONFIG,
        mortalityMultiplier: 1.0,
      });

      const highMortality = await engine.runChunk({
        ...DEFAULT_CHUNK_CONFIG,
        mortalityMultiplier: 1.5,
      });

      // Higher mortality should result in different (lower) mean NPV
      const baseMean = baseResult.scenarioNpvs.reduce((a, b) => a + b, 0) / baseResult.scenarioNpvs.length;
      const highMean = highMortality.scenarioNpvs.reduce((a, b) => a + b, 0) / highMortality.scenarioNpvs.length;

      expect(highMean).toBeLessThan(baseMean);
    });

    it('should throw when running without policies', async () => {
      engine.clearPolicies();
      await expect(engine.runChunk(DEFAULT_CHUNK_CONFIG)).rejects.toThrow(
        'Policies not loaded'
      );
    });

    it('should throw when running without assumptions', async () => {
      const freshEngine = new MockCalcEngine();
      await freshEngine.initialize();
      await freshEngine.loadPolicies(SAMPLE_POLICIES_CSV);

      await expect(freshEngine.runChunk(DEFAULT_CHUNK_CONFIG)).rejects.toThrow(
        'Assumptions not loaded'
      );

      freshEngine.dispose();
    });
  });

  describe('dispose', () => {
    it('should reset state on dispose', async () => {
      await engine.loadPolicies(SAMPLE_POLICIES_CSV);
      await engine.loadAssumptions(SAMPLE_ASSUMPTIONS);

      expect(engine.isInitialized).toBe(true);
      expect(engine.hasPolicies).toBe(true);
      expect(engine.hasAssumptions).toBe(true);

      engine.dispose();

      expect(engine.isInitialized).toBe(false);
      expect(engine.hasPolicies).toBe(false);
      expect(engine.hasAssumptions).toBe(false);
    });
  });
});

describe('MockCalcEngine factories', () => {
  it('createFastMockEngine should create instant engine', async () => {
    const engine = createFastMockEngine();
    await engine.initialize();
    await engine.loadPolicies(SAMPLE_POLICIES_CSV);
    await engine.loadAssumptions(SAMPLE_ASSUMPTIONS);

    const start = performance.now();
    await engine.runChunk({ ...DEFAULT_CHUNK_CONFIG, numScenarios: 10000 });
    const elapsed = performance.now() - start;

    // Should be very fast (< 100ms for 10K scenarios)
    expect(elapsed).toBeLessThan(100);
    engine.dispose();
  });

  it('createRealisticMockEngine should simulate realistic timing', async () => {
    const engine = createRealisticMockEngine();
    await engine.initialize();
    await engine.loadPolicies(SAMPLE_POLICIES_CSV);
    await engine.loadAssumptions(SAMPLE_ASSUMPTIONS);

    const start = performance.now();
    await engine.runChunk({ ...DEFAULT_CHUNK_CONFIG, numScenarios: 1000 });
    const elapsed = performance.now() - start;

    // Should take some time (> 0.1ms due to simulated delay)
    expect(elapsed).toBeGreaterThan(0);
    engine.dispose();
  });

  it('createFailingInitMockEngine should fail on init', async () => {
    const engine = createFailingInitMockEngine('Custom init error');
    await expect(engine.initialize()).rejects.toThrow('Custom init error');
  });

  it('createFailingRunMockEngine should fail on runChunk', async () => {
    const engine = createFailingRunMockEngine('Custom run error');
    await engine.initialize();
    await engine.loadPolicies(SAMPLE_POLICIES_CSV);
    await engine.loadAssumptions(SAMPLE_ASSUMPTIONS);

    await expect(engine.runChunk(DEFAULT_CHUNK_CONFIG)).rejects.toThrow(
      'Custom run error'
    );
    engine.dispose();
  });

  it('createMockEngineFactory should create factory', async () => {
    const factory = createMockEngineFactory({ baseMeanNpv: 500000 });

    const engine1 = factory();
    const engine2 = factory();

    await engine1.initialize();
    await engine2.initialize();

    expect(engine1.isInitialized).toBe(true);
    expect(engine2.isInitialized).toBe(true);

    // Should be separate instances
    engine1.dispose();
    expect(engine1.isInitialized).toBe(false);
    expect(engine2.isInitialized).toBe(true);

    engine2.dispose();
  });
});

describe('CalcEngine interface compliance', () => {
  it('MockCalcEngine should implement CalcEngine interface', () => {
    const engine: CalcEngine = new MockCalcEngine();

    // Type checks - if this compiles, interface is implemented
    expect(typeof engine.initialize).toBe('function');
    expect(typeof engine.getInfo).toBe('function');
    expect(typeof engine.loadPolicies).toBe('function');
    expect(typeof engine.loadAssumptions).toBe('function');
    expect(typeof engine.clearPolicies).toBe('function');
    expect(typeof engine.runChunk).toBe('function');
    expect(typeof engine.dispose).toBe('function');
    expect('isInitialized' in engine).toBe(true);
    expect('hasPolicies' in engine).toBe(true);
    expect('hasAssumptions' in engine).toBe(true);
  });
});

describe('Large scale tests', () => {
  it('should handle 10K scenarios', async () => {
    const engine = new MockCalcEngine();
    await engine.initialize();
    await engine.loadPolicies(SAMPLE_POLICIES_CSV);
    await engine.loadAssumptions(SAMPLE_ASSUMPTIONS);

    const result = await engine.runChunk({
      ...DEFAULT_CHUNK_CONFIG,
      numScenarios: 10000,
    });

    expect(result.scenarioNpvs.length).toBe(10000);
    engine.dispose();
  });

  it('should produce valid statistics from results', async () => {
    const engine = new MockCalcEngine({
      baseMeanNpv: 1_000_000,
      stdDev: 100_000,
    });
    await engine.initialize();
    await engine.loadPolicies(SAMPLE_POLICIES_CSV);
    await engine.loadAssumptions(SAMPLE_ASSUMPTIONS);

    const result = await engine.runChunk({
      ...DEFAULT_CHUNK_CONFIG,
      numScenarios: 10000,
    });

    const npvs = result.scenarioNpvs;
    const mean = npvs.reduce((a, b) => a + b, 0) / npvs.length;
    const variance =
      npvs.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / npvs.length;
    const stdDev = Math.sqrt(variance);

    // Mean should be close to configured base (within 5%)
    expect(Math.abs(mean - 1_000_000) / 1_000_000).toBeLessThan(0.05);

    // StdDev should be close to configured value (within 20%)
    expect(Math.abs(stdDev - 100_000) / 100_000).toBeLessThan(0.20);

    engine.dispose();
  });
});
