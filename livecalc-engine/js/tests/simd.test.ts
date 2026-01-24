/**
 * SIMD Feature Detection and Build Tests
 *
 * Tests for SIMD detection utilities and validates that SIMD build
 * produces identical results to scalar build.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  isSimdSupported,
  clearSimdCache,
  getSimdSupportInfo,
  selectSimdModule,
  getSimdBrowserRequirements,
  SIMD_BROWSER_SUPPORT,
  LiveCalcEngine,
  DEFAULT_SCENARIO_PARAMS,
} from '../src/index.js';
import type { CreateLiveCalcModule, SimdModuleConfig } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths to WASM builds
const WASM_SCALAR_DIR = join(__dirname, '../../build-wasm');
const WASM_SIMD_DIR = join(__dirname, '../../build-wasm-simd');
const DATA_DIR = join(__dirname, '../../data');

// Load sample data files
const loadSampleData = () => ({
  policies: readFileSync(join(DATA_DIR, 'sample_policies.csv'), 'utf-8'),
  mortality: readFileSync(join(DATA_DIR, 'sample_mortality.csv'), 'utf-8'),
  lapse: readFileSync(join(DATA_DIR, 'sample_lapse.csv'), 'utf-8'),
  expenses: readFileSync(join(DATA_DIR, 'sample_expenses.csv'), 'utf-8'),
});

// Check if WASM modules exist
const scalarModuleExists = (): boolean => {
  try {
    readFileSync(join(WASM_SCALAR_DIR, 'livecalc.mjs'));
    return true;
  } catch {
    return false;
  }
};

const simdModuleExists = (): boolean => {
  try {
    readFileSync(join(WASM_SIMD_DIR, 'livecalc-simd.mjs'));
    return true;
  } catch {
    return false;
  }
};

describe('SIMD Feature Detection', () => {
  beforeEach(() => {
    clearSimdCache();
  });

  afterEach(() => {
    clearSimdCache();
  });

  it('should detect SIMD support', () => {
    const supported = isSimdSupported();
    // Node.js 16+ supports SIMD natively
    expect(typeof supported).toBe('boolean');
  });

  it('should cache detection result', () => {
    const first = isSimdSupported();
    const second = isSimdSupported();
    expect(first).toBe(second);
  });

  it('should clear cache', () => {
    isSimdSupported();
    clearSimdCache();
    // After clearing, next call should work without error
    const result = isSimdSupported();
    expect(typeof result).toBe('boolean');
  });

  it('should provide detailed support info', () => {
    const info = getSimdSupportInfo();
    expect(info).toHaveProperty('supported');
    expect(info).toHaveProperty('environment');
    expect(['browser', 'node', 'unknown']).toContain(info.environment);
  });

  it('should detect Node.js environment', () => {
    const info = getSimdSupportInfo();
    expect(info.environment).toBe('node');
    expect(info.nodeVersion).toBeDefined();
  });

  it('should have Node.js notes for SIMD', () => {
    const info = getSimdSupportInfo();
    expect(info.notes).toBeDefined();
    expect(info.notes).toContain('Node');
  });
});

describe('SIMD Module Selection', () => {
  it('should select SIMD module when supported', () => {
    const config: SimdModuleConfig = {
      simdModule: './livecalc-simd.mjs',
      scalarModule: './livecalc.mjs',
    };

    const selection = selectSimdModule(config);

    if (isSimdSupported()) {
      expect(selection.isSimd).toBe(true);
      expect(selection.module).toBe('./livecalc-simd.mjs');
      expect(selection.reason).toContain('SIMD');
    } else {
      expect(selection.isSimd).toBe(false);
      expect(selection.module).toBe('./livecalc.mjs');
      expect(selection.reason).toContain('fallback');
    }
  });

  it('should respect forceMode: simd', () => {
    const config: SimdModuleConfig = {
      simdModule: './livecalc-simd.mjs',
      scalarModule: './livecalc.mjs',
      forceMode: 'simd',
    };

    const selection = selectSimdModule(config);
    expect(selection.isSimd).toBe(true);
    expect(selection.module).toBe('./livecalc-simd.mjs');
    expect(selection.reason).toContain('forced');
  });

  it('should respect forceMode: scalar', () => {
    const config: SimdModuleConfig = {
      simdModule: './livecalc-simd.mjs',
      scalarModule: './livecalc.mjs',
      forceMode: 'scalar',
    };

    const selection = selectSimdModule(config);
    expect(selection.isSimd).toBe(false);
    expect(selection.module).toBe('./livecalc.mjs');
    expect(selection.reason).toContain('forced');
  });

  it('should support function modules', () => {
    const simdLoader = async () => ({ default: 'simd' });
    const scalarLoader = async () => ({ default: 'scalar' });

    const config: SimdModuleConfig = {
      simdModule: simdLoader,
      scalarModule: scalarLoader,
    };

    const selection = selectSimdModule(config);
    expect(typeof selection.module).toBe('function');
  });
});

describe('SIMD Browser Support Constants', () => {
  it('should have correct minimum versions', () => {
    expect(SIMD_BROWSER_SUPPORT.chrome).toBe(91);
    expect(SIMD_BROWSER_SUPPORT.firefox).toBe(89);
    expect(SIMD_BROWSER_SUPPORT.safari).toBe(16.4);
    expect(SIMD_BROWSER_SUPPORT.edge).toBe(91);
    expect(SIMD_BROWSER_SUPPORT.node).toBe(16);
  });

  it('should generate browser requirements string', () => {
    const requirements = getSimdBrowserRequirements();
    expect(requirements).toContain('Chrome 91');
    expect(requirements).toContain('Firefox 89');
    expect(requirements).toContain('Safari 16.4');
    expect(requirements).toContain('Node.js 16');
  });
});

// Skip parity tests if WASM modules not built
const describeIfBothModulesExist =
  scalarModuleExists() && simdModuleExists() && isSimdSupported()
    ? describe
    : describe.skip;

describeIfBothModulesExist('SIMD vs Scalar Parity', () => {
  let scalarEngine: LiveCalcEngine;
  let simdEngine: LiveCalcEngine;
  let sampleData: ReturnType<typeof loadSampleData>;

  beforeEach(async () => {
    sampleData = loadSampleData();
  });

  afterEach(() => {
    scalarEngine?.dispose();
    simdEngine?.dispose();
  });

  it('should produce identical results for same input', async () => {
    // Load scalar module
    const scalarModule = await import(join(WASM_SCALAR_DIR, 'livecalc.mjs'));
    scalarEngine = new LiveCalcEngine();
    await scalarEngine.initialize(scalarModule.default);

    // Load SIMD module
    const simdModule = await import(join(WASM_SIMD_DIR, 'livecalc-simd.mjs'));
    simdEngine = new LiveCalcEngine();
    await simdEngine.initialize(simdModule.default);

    // Load data into both engines
    scalarEngine.loadPoliciesFromCsv(sampleData.policies);
    scalarEngine.loadMortalityFromCsv(sampleData.mortality);
    scalarEngine.loadLapseFromCsv(sampleData.lapse);
    scalarEngine.loadExpensesFromCsv(sampleData.expenses);

    simdEngine.loadPoliciesFromCsv(sampleData.policies);
    simdEngine.loadMortalityFromCsv(sampleData.mortality);
    simdEngine.loadLapseFromCsv(sampleData.lapse);
    simdEngine.loadExpensesFromCsv(sampleData.expenses);

    // Run valuations with same seed
    const config = {
      numScenarios: 100,
      seed: 42,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
      storeDistribution: true,
    };

    const scalarResult = scalarEngine.runValuation(config);
    const simdResult = simdEngine.runValuation(config);

    // Results should be identical (same seed, same algorithm)
    expect(simdResult.statistics.meanNpv).toBeCloseTo(
      scalarResult.statistics.meanNpv,
      6
    );
    expect(simdResult.statistics.stdDev).toBeCloseTo(
      scalarResult.statistics.stdDev,
      6
    );
    expect(simdResult.statistics.cte95).toBeCloseTo(
      scalarResult.statistics.cte95,
      6
    );
    expect(simdResult.statistics.percentiles.p50).toBeCloseTo(
      scalarResult.statistics.percentiles.p50,
      6
    );
    expect(simdResult.statistics.percentiles.p95).toBeCloseTo(
      scalarResult.statistics.percentiles.p95,
      6
    );
  });

  it('should have distribution parity', async () => {
    // Load modules
    const scalarModule = await import(join(WASM_SCALAR_DIR, 'livecalc.mjs'));
    scalarEngine = new LiveCalcEngine();
    await scalarEngine.initialize(scalarModule.default);

    const simdModule = await import(join(WASM_SIMD_DIR, 'livecalc-simd.mjs'));
    simdEngine = new LiveCalcEngine();
    await simdEngine.initialize(simdModule.default);

    // Load data
    scalarEngine.loadPoliciesFromCsv(sampleData.policies);
    scalarEngine.loadMortalityFromCsv(sampleData.mortality);
    scalarEngine.loadLapseFromCsv(sampleData.lapse);
    scalarEngine.loadExpensesFromCsv(sampleData.expenses);

    simdEngine.loadPoliciesFromCsv(sampleData.policies);
    simdEngine.loadMortalityFromCsv(sampleData.mortality);
    simdEngine.loadLapseFromCsv(sampleData.lapse);
    simdEngine.loadExpensesFromCsv(sampleData.expenses);

    // Run with same seed
    const config = {
      numScenarios: 50,
      seed: 12345,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
      storeDistribution: true,
    };

    const scalarResult = scalarEngine.runValuation(config);
    const simdResult = simdEngine.runValuation(config);

    // Check all scenario NPVs match
    expect(simdResult.distribution).toBeDefined();
    expect(scalarResult.distribution).toBeDefined();
    expect(simdResult.distribution!.length).toBe(scalarResult.distribution!.length);

    for (let i = 0; i < simdResult.distribution!.length; i++) {
      expect(simdResult.distribution![i]).toBeCloseTo(
        scalarResult.distribution![i],
        6
      );
    }
  });
});
