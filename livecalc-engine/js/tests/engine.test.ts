/**
 * LiveCalc Engine Unit Tests
 *
 * Tests the JavaScript wrapper for the WASM projection engine.
 * Uses vitest for testing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LiveCalcEngine,
  LiveCalcError,
  DEFAULT_SCENARIO_PARAMS,
} from '../src/index.js';
import type {
  Policy,
  MortalityTable,
  LapseTable,
  ExpenseAssumptions,
  LiveCalcWasmModule,
} from '../src/index.js';

// Sample test data
const SAMPLE_POLICIES: Policy[] = [
  {
    policyId: 1,
    age: 30,
    gender: 'M',
    sumAssured: 100000,
    premium: 500,
    term: 20,
    productType: 'TERM',
  },
  {
    policyId: 2,
    age: 35,
    gender: 'F',
    sumAssured: 150000,
    premium: 750,
    term: 25,
    productType: 'TERM',
  },
];

const SAMPLE_POLICIES_CSV = `policy_id,age,gender,sum_assured,premium,term,product_type
1,30,M,100000,500,20,TERM
2,35,F,150000,750,25,TERM`;

const SAMPLE_MORTALITY_CSV = `age,male_qx,female_qx
0,0.00450,0.00380
1,0.00035,0.00029
30,0.00091,0.00029
35,0.00095,0.00035
40,0.00110,0.00045`;

const SAMPLE_LAPSE_CSV = `year,lapse_rate
1,0.15
2,0.12
3,0.10
4,0.08
5,0.06`;

const SAMPLE_EXPENSES_CSV = `name,value
per_policy_acquisition,500
per_policy_maintenance,50
percent_of_premium,0.05
claim_expense,100`;

// Create mock WASM module
function createMockModule(): LiveCalcWasmModule {
  const allocatedPtrs = new Set<number>();
  let nextPtr = 1024;
  let policyCount = 0;
  let mortalityLoaded = false;
  let lapseLoaded = false;
  let expensesLoaded = false;
  let valuationRun = false;

  // Create large arrays for HEAP simulation
  const heapU8 = new Uint8Array(1024 * 1024);
  const heapF64 = new Float64Array(1024 * 128);

  return {
    // Memory management
    _livecalc_malloc: (size: number) => {
      const ptr = nextPtr;
      nextPtr += size + 8; // Add padding
      allocatedPtrs.add(ptr);
      return ptr;
    },
    _livecalc_free: (ptr: number) => {
      allocatedPtrs.delete(ptr);
    },

    // Policy loading
    _load_policies_csv: (_dataPtr: number, _size: number) => {
      policyCount = 2; // Simulate 2 policies loaded
      return policyCount;
    },
    _load_policies_binary: (_dataPtr: number, _size: number) => {
      policyCount = 2;
      return policyCount;
    },
    _get_policy_count: () => policyCount,
    _clear_policies: () => {
      policyCount = 0;
    },

    // Assumption loading
    _load_mortality_csv: (_dataPtr: number, _size: number) => {
      mortalityLoaded = true;
      return 0;
    },
    _load_mortality_binary: (_dataPtr: number, _size: number) => {
      mortalityLoaded = true;
      return 0;
    },
    _load_lapse_csv: (_dataPtr: number, _size: number) => {
      lapseLoaded = true;
      return 0;
    },
    _load_lapse_binary: (_dataPtr: number, _size: number) => {
      lapseLoaded = true;
      return 0;
    },
    _load_expenses_csv: (_dataPtr: number, _size: number) => {
      expensesLoaded = true;
      return 0;
    },
    _load_expenses_binary: (_dataPtr: number, _size: number) => {
      expensesLoaded = true;
      return 0;
    },

    // Valuation execution
    _run_valuation: (
      _numScenarios: number,
      _seed: bigint,
      _initialRate: number,
      _drift: number,
      _volatility: number,
      _minRate: number,
      _maxRate: number,
      _mortalityMult: number,
      _lapseMult: number,
      _expenseMult: number,
      _storeDistribution: number
    ) => {
      if (policyCount === 0 || !mortalityLoaded || !lapseLoaded || !expensesLoaded) {
        return -1;
      }
      valuationRun = true;
      return 0;
    },

    // Result accessors
    _get_result_mean: () => (valuationRun ? 12345.67 : 0),
    _get_result_std_dev: () => (valuationRun ? 1234.56 : 0),
    _get_result_p50: () => (valuationRun ? 12000.0 : 0),
    _get_result_p75: () => (valuationRun ? 13000.0 : 0),
    _get_result_p90: () => (valuationRun ? 14000.0 : 0),
    _get_result_p95: () => (valuationRun ? 15000.0 : 0),
    _get_result_p99: () => (valuationRun ? 16000.0 : 0),
    _get_result_cte95: () => (valuationRun ? 11000.0 : 0),
    _get_result_execution_time_ms: () => (valuationRun ? 100.5 : 0),
    _get_result_scenario_count: () => (valuationRun ? 100 : 0),
    _get_result_scenario_npv: (index: number) => (valuationRun ? 12000 + index * 10 : 0),
    _get_result_distribution: (bufferPtr: number, bufferSize: number) => {
      if (!valuationRun || bufferSize < 100) return -1;
      // Write mock distribution to buffer
      const offset = Math.floor(bufferPtr / 8);
      for (let i = 0; i < 100; i++) {
        heapF64[offset + i] = 12000 + i * 10;
      }
      return 100;
    },

    // JSON output
    _generate_result_json: () => {
      return valuationRun ? 100 : -1;
    },
    _get_result_json_ptr: () => 2048,
    _get_result_json_length: () => 100,

    // Version
    _get_version: () => 4096,

    // Emscripten runtime methods
    UTF8ToString: (ptr: number, _maxLen?: number) => {
      if (ptr === 4096) return '1.0.0';
      if (ptr === 2048) return '{"statistics":{"mean_npv":12345.67}}';
      return '';
    },
    stringToUTF8: (_str: string, _ptr: number, _maxLen: number) => {},
    lengthBytesUTF8: (str: string) => str.length,
    getValue: (_ptr: number, _type: string) => 0,
    setValue: (_ptr: number, _value: number, _type: string) => {},

    // HEAP access
    HEAPU8: heapU8,
    HEAPF64: heapF64,
  };
}

// Mock module factory
const createMockModuleFactory = () => Promise.resolve(createMockModule());

describe('LiveCalcEngine', () => {
  let engine: LiveCalcEngine;

  beforeEach(() => {
    engine = new LiveCalcEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  describe('initialization', () => {
    it('should initialize with module factory', async () => {
      expect(engine.isInitialized).toBe(false);

      await engine.initialize(createMockModuleFactory);

      expect(engine.isInitialized).toBe(true);
    });

    it('should throw if already initialized', async () => {
      await engine.initialize(createMockModuleFactory);

      await expect(engine.initialize(createMockModuleFactory)).rejects.toThrow(
        LiveCalcError
      );
    });

    it('should throw on failed initialization', async () => {
      const failingFactory = () => Promise.reject(new Error('WASM load failed'));

      await expect(engine.initialize(failingFactory)).rejects.toThrow(
        /Failed to initialize WASM module/
      );
    });

    it('should report not ready before data loaded', async () => {
      await engine.initialize(createMockModuleFactory);

      expect(engine.isReady).toBe(false);
    });
  });

  describe('version', () => {
    it('should return version string', async () => {
      await engine.initialize(createMockModuleFactory);

      const version = engine.getVersion();

      expect(version).toBe('1.0.0');
    });

    it('should throw if not initialized', () => {
      expect(() => engine.getVersion()).toThrow(LiveCalcError);
    });
  });

  describe('policy loading', () => {
    beforeEach(async () => {
      await engine.initialize(createMockModuleFactory);
    });

    it('should load policies from CSV', () => {
      const count = engine.loadPoliciesFromCsv(SAMPLE_POLICIES_CSV);

      expect(count).toBe(2);
      expect(engine.getPolicyCount()).toBe(2);
    });

    it('should load policies from array', () => {
      const count = engine.loadPolicies(SAMPLE_POLICIES);

      expect(count).toBe(2);
    });

    it('should throw on empty policy array', () => {
      expect(() => engine.loadPolicies([])).toThrow(LiveCalcError);
    });

    it('should clear policies', () => {
      engine.loadPoliciesFromCsv(SAMPLE_POLICIES_CSV);
      expect(engine.getPolicyCount()).toBe(2);

      engine.clearPolicies();

      expect(engine.getPolicyCount()).toBe(0);
    });
  });

  describe('assumption loading', () => {
    beforeEach(async () => {
      await engine.initialize(createMockModuleFactory);
    });

    it('should load mortality from CSV', () => {
      expect(() => engine.loadMortalityFromCsv(SAMPLE_MORTALITY_CSV)).not.toThrow();
    });

    it('should load mortality from object', () => {
      const mortality: MortalityTable = {
        male: [0.0045, 0.00035, 0.00091],
        female: [0.0038, 0.00029, 0.00029],
      };

      expect(() => engine.loadMortality(mortality)).not.toThrow();
    });

    it('should load lapse from CSV', () => {
      expect(() => engine.loadLapseFromCsv(SAMPLE_LAPSE_CSV)).not.toThrow();
    });

    it('should load lapse from array', () => {
      const lapse: LapseTable = [0.15, 0.12, 0.10, 0.08, 0.06];

      expect(() => engine.loadLapse(lapse)).not.toThrow();
    });

    it('should load expenses from CSV', () => {
      expect(() => engine.loadExpensesFromCsv(SAMPLE_EXPENSES_CSV)).not.toThrow();
    });

    it('should load expenses from object', () => {
      const expenses: ExpenseAssumptions = {
        perPolicyAcquisition: 500,
        perPolicyMaintenance: 50,
        percentOfPremium: 0.05,
        claimExpense: 100,
      };

      expect(() => engine.loadExpenses(expenses)).not.toThrow();
    });
  });

  describe('valuation', () => {
    beforeEach(async () => {
      await engine.initialize(createMockModuleFactory);
      engine.loadPoliciesFromCsv(SAMPLE_POLICIES_CSV);
      engine.loadMortalityFromCsv(SAMPLE_MORTALITY_CSV);
      engine.loadLapseFromCsv(SAMPLE_LAPSE_CSV);
      engine.loadExpensesFromCsv(SAMPLE_EXPENSES_CSV);
    });

    it('should report ready after all data loaded', () => {
      expect(engine.isReady).toBe(true);
    });

    it('should run valuation and return result', () => {
      const result = engine.runValuation({
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      });

      expect(result.statistics.meanNpv).toBe(12345.67);
      expect(result.statistics.stdDev).toBe(1234.56);
      expect(result.statistics.percentiles.p50).toBe(12000.0);
      expect(result.statistics.percentiles.p95).toBe(15000.0);
      expect(result.statistics.cte95).toBe(11000.0);
      expect(result.executionTimeMs).toBe(100.5);
      expect(result.scenarioCount).toBe(100);
    });

    it('should include distribution when requested', () => {
      const result = engine.runValuation({
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
        storeDistribution: true,
      });

      expect(result.distribution).toBeDefined();
      expect(result.distribution!.length).toBe(100);
    });

    it('should not include distribution when not requested', () => {
      const result = engine.runValuation({
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
        storeDistribution: false,
      });

      expect(result.distribution).toBeUndefined();
    });

    it('should apply multipliers', () => {
      const result = engine.runValuation({
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
        mortalityMultiplier: 1.5,
        lapseMultiplier: 0.8,
        expenseMultiplier: 1.2,
      });

      expect(result.statistics.meanNpv).toBeDefined();
    });

    it('should throw on invalid numScenarios', () => {
      expect(() =>
        engine.runValuation({
          numScenarios: 0,
          seed: 42,
          scenarioParams: DEFAULT_SCENARIO_PARAMS,
        })
      ).toThrow(LiveCalcError);

      expect(() =>
        engine.runValuation({
          numScenarios: -1,
          seed: 42,
          scenarioParams: DEFAULT_SCENARIO_PARAMS,
        })
      ).toThrow(LiveCalcError);
    });

    it('should throw on invalid seed', () => {
      expect(() =>
        engine.runValuation({
          numScenarios: 100,
          seed: -1,
          scenarioParams: DEFAULT_SCENARIO_PARAMS,
        })
      ).toThrow(LiveCalcError);
    });

    it('should throw if data not loaded', async () => {
      const freshEngine = new LiveCalcEngine();
      await freshEngine.initialize(createMockModuleFactory);

      expect(() =>
        freshEngine.runValuation({
          numScenarios: 100,
          seed: 42,
          scenarioParams: DEFAULT_SCENARIO_PARAMS,
        })
      ).toThrow(/Missing required data/);

      freshEngine.dispose();
    });
  });

  describe('JSON result', () => {
    beforeEach(async () => {
      await engine.initialize(createMockModuleFactory);
      engine.loadPoliciesFromCsv(SAMPLE_POLICIES_CSV);
      engine.loadMortalityFromCsv(SAMPLE_MORTALITY_CSV);
      engine.loadLapseFromCsv(SAMPLE_LAPSE_CSV);
      engine.loadExpensesFromCsv(SAMPLE_EXPENSES_CSV);
    });

    it('should return JSON string after valuation', () => {
      engine.runValuation({
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      });

      const json = engine.getResultJson();

      expect(typeof json).toBe('string');
      expect(json).toContain('mean_npv');
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      await engine.initialize(createMockModuleFactory);

      engine.dispose();

      expect(engine.isInitialized).toBe(false);
      expect(engine.isReady).toBe(false);
    });

    it('should allow re-initialization after dispose', async () => {
      await engine.initialize(createMockModuleFactory);
      engine.dispose();

      await engine.initialize(createMockModuleFactory);

      expect(engine.isInitialized).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw NOT_INITIALIZED when not initialized', () => {
      try {
        engine.loadPoliciesFromCsv(SAMPLE_POLICIES_CSV);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LiveCalcError);
        expect((error as LiveCalcError).code).toBe('NOT_INITIALIZED');
      }
    });

    it('should have meaningful error messages', async () => {
      await engine.initialize(createMockModuleFactory);

      try {
        engine.runValuation({
          numScenarios: 100,
          seed: 42,
          scenarioParams: DEFAULT_SCENARIO_PARAMS,
        });
      } catch (error) {
        expect((error as LiveCalcError).message).toMatch(/Missing required data/);
      }
    });
  });
});

describe('DEFAULT_SCENARIO_PARAMS', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_SCENARIO_PARAMS.initialRate).toBe(0.04);
    expect(DEFAULT_SCENARIO_PARAMS.drift).toBe(0.0);
    expect(DEFAULT_SCENARIO_PARAMS.volatility).toBe(0.02);
    expect(DEFAULT_SCENARIO_PARAMS.minRate).toBe(0.0);
    expect(DEFAULT_SCENARIO_PARAMS.maxRate).toBe(0.15);
  });
});
