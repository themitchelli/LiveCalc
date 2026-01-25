/**
 * Tests for PyodideEngine - Python-based calculation engine
 *
 * These tests verify the PyodideEngine adapter implements the CalcEngine
 * interface correctly and can execute Python scripts within the pipeline.
 *
 * Note: These are unit tests with mocked Pyodide runtime.
 * Integration tests with real Pyodide are in python-integration.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PyodideEngine, PyodideEngineError } from '../src/engines/pyodide-engine.js';
import type { ChunkConfig } from '../src/calc-engine.js';

/**
 * Mock Pyodide interface for testing without loading the full runtime.
 */
class MockPyodide {
  public globals = new Map<string, any>();
  public filesystem = new Map<string, string>();

  async loadPackagesFromImports(code: string): Promise<void> {
    // Mock package loading (no-op)
    return Promise.resolve();
  }

  async runPythonAsync(code: string): Promise<any> {
    // Simulate Python execution with basic parsing
    if (code.includes('calc_engine.initialize()')) {
      return undefined;
    }

    if (code.includes('calc_engine.load_policies')) {
      // Return mock policy count
      return 100;
    }

    if (code.includes('calc_engine.load_assumptions')) {
      return undefined;
    }

    if (code.includes('calc_engine.run_chunk')) {
      // Return mock NPV array
      const match = code.match(/num_scenarios=(\d+)/);
      const numScenarios = match ? parseInt(match[1], 10) : 10;
      return Array(numScenarios)
        .fill(0)
        .map((_, i) => 1000 + i);
    }

    if (code.includes('required_functions =')) {
      // Validation check - all functions exist
      return undefined;
    }

    return undefined;
  }

  runPython(code: string): any {
    return this.runPythonAsync(code);
  }

  get FS() {
    return {
      writeFile: (path: string, data: string) => {
        this.filesystem.set(path, data);
      },
      readFile: (path: string): Uint8Array => {
        const data = this.filesystem.get(path) || '';
        return new TextEncoder().encode(data);
      },
    };
  }
}

/**
 * Mock loadPyodide function.
 */
function mockLoadPyodide(): MockPyodide {
  return new MockPyodide();
}

/**
 * Sample Python script for testing.
 */
const SAMPLE_SCRIPT = `
import numpy as np

# Global state
policies = []
assumptions = {}

def initialize():
    global policies, assumptions
    policies = []
    assumptions = {}

def load_policies(csv_data):
    global policies
    # Parse CSV (mock)
    policies = csv_data.split('\\n')[1:]  # Skip header
    return len(policies)

def load_assumptions(mortality_csv, lapse_csv, expenses_csv):
    global assumptions
    assumptions = {
        'mortality': mortality_csv,
        'lapse': lapse_csv,
        'expenses': expenses_csv
    }

def run_chunk(num_scenarios, seed, scenario_params, mortality_mult, lapse_mult, expense_mult):
    # Simple deterministic NPV calculation
    np.random.seed(seed)
    base_npv = 1000.0
    shock = np.random.randn(num_scenarios)
    return base_npv + shock * 100.0
`;

describe('PyodideEngine', () => {
  beforeEach(() => {
    // Mock global loadPyodide
    (globalThis as any).loadPyodide = mockLoadPyodide;
  });

  describe('initialization', () => {
    it('should initialize successfully with valid script', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });

      await engine.initialize();

      expect(engine.isInitialized).toBe(true);
      expect(engine.hasPolicies).toBe(false);
      expect(engine.hasAssumptions).toBe(false);
    });

    it('should throw error if already initialized', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });
      await engine.initialize();

      await expect(engine.initialize()).rejects.toThrow(PyodideEngineError);
      await expect(engine.initialize()).rejects.toThrow('already initialized');
    });

    it('should throw error if Pyodide not available', async () => {
      delete (globalThis as any).loadPyodide;

      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });

      await expect(engine.initialize()).rejects.toThrow('Pyodide not available');
    });

    it('should set default config values', () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });

      const config = (engine as any).config;
      expect(config.scriptPath).toBe('/calc_engine.py');
      expect(config.packages).toEqual([]);
      expect(config.timeout).toBe(30000);
    });

    it('should use custom config values when provided', () => {
      const engine = new PyodideEngine({
        scriptCode: SAMPLE_SCRIPT,
        scriptPath: '/custom_engine.py',
        packages: ['scipy', 'pandas'],
        timeout: 60000,
      });

      const config = (engine as any).config;
      expect(config.scriptPath).toBe('/custom_engine.py');
      expect(config.packages).toEqual(['scipy', 'pandas']);
      expect(config.timeout).toBe(60000);
    });
  });

  describe('getInfo', () => {
    it('should return correct engine metadata', () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });

      const info = engine.getInfo();

      expect(info.name).toBe('PyodideEngine');
      expect(info.version).toBe('1.0.0');
      expect(info.maxPolicies).toBe(1_000_000);
      expect(info.maxScenariosPerChunk).toBe(100_000);
      expect(info.supportsBinaryInput).toBe(false);
    });
  });

  describe('loadPolicies', () => {
    it('should load policies from CSV string', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });
      await engine.initialize();

      const csvData = 'policy_id,age,gender\n1,35,M\n2,42,F';
      const policyCount = await engine.loadPolicies(csvData);

      expect(policyCount).toBe(100); // Mock returns 100
      expect(engine.hasPolicies).toBe(true);
    });

    it('should throw error if not initialized', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });

      await expect(engine.loadPolicies('csv data')).rejects.toThrow('not initialized');
    });

    it('should convert ArrayBuffer to CSV string', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });
      await engine.initialize();

      const csvData = 'policy_id,age,gender\n1,35,M';
      const buffer = new TextEncoder().encode(csvData).buffer;

      const policyCount = await engine.loadPolicies(buffer);

      expect(policyCount).toBe(100);
      expect(engine.hasPolicies).toBe(true);
    });
  });

  describe('loadAssumptions', () => {
    it('should load assumptions from CSV strings', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });
      await engine.initialize();

      const assumptions = {
        mortality: 'age,male,female\n0,0.001,0.0008',
        lapse: 'year,rate\n1,0.05',
        expenses: 'type,amount\nacquisition,100',
      };

      await engine.loadAssumptions(assumptions);

      expect(engine.hasAssumptions).toBe(true);
    });

    it('should throw error if not initialized', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });

      const assumptions = {
        mortality: 'data',
        lapse: 'data',
        expenses: 'data',
      };

      await expect(engine.loadAssumptions(assumptions)).rejects.toThrow('not initialized');
    });

    it('should convert ArrayBuffer assumptions to CSV', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });
      await engine.initialize();

      const mortalityBuf = new TextEncoder().encode('age,male,female\n0,0.001,0.0008').buffer;
      const lapseBuf = new TextEncoder().encode('year,rate\n1,0.05').buffer;
      const expensesBuf = new TextEncoder().encode('type,amount\nacquisition,100').buffer;

      await engine.loadAssumptions({
        mortality: mortalityBuf,
        lapse: lapseBuf,
        expenses: expensesBuf,
      });

      expect(engine.hasAssumptions).toBe(true);
    });
  });

  describe('clearPolicies', () => {
    it('should clear policies flag', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });
      await engine.initialize();
      await engine.loadPolicies('csv data');

      expect(engine.hasPolicies).toBe(true);

      engine.clearPolicies();

      expect(engine.hasPolicies).toBe(false);
    });
  });

  describe('runChunk', () => {
    it('should execute chunk and return NPV array', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });
      await engine.initialize();
      await engine.loadPolicies('csv data');
      await engine.loadAssumptions({
        mortality: 'data',
        lapse: 'data',
        expenses: 'data',
      });

      const config: ChunkConfig = {
        numScenarios: 10,
        seed: 42,
        scenarioParams: {
          initialRate: 0.03,
          drift: 0.01,
          volatility: 0.02,
          minRate: 0.0,
          maxRate: 0.1,
        },
        mortalityMultiplier: 1.0,
        lapseMultiplier: 1.0,
        expenseMultiplier: 1.0,
      };

      const result = await engine.runChunk(config);

      expect(result.scenarioNpvs).toBeInstanceOf(Float64Array);
      expect(result.scenarioNpvs.length).toBe(10);
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should throw error if not initialized', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });

      const config: ChunkConfig = {
        numScenarios: 10,
        seed: 42,
        scenarioParams: {
          initialRate: 0.03,
          drift: 0.01,
          volatility: 0.02,
          minRate: 0.0,
          maxRate: 0.1,
        },
      };

      await expect(engine.runChunk(config)).rejects.toThrow('not initialized');
    });

    it('should throw error if data not loaded', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });
      await engine.initialize();

      const config: ChunkConfig = {
        numScenarios: 10,
        seed: 42,
        scenarioParams: {
          initialRate: 0.03,
          drift: 0.01,
          volatility: 0.02,
          minRate: 0.0,
          maxRate: 0.1,
        },
      };

      await expect(engine.runChunk(config)).rejects.toThrow('must be loaded');
    });

    it('should handle different scenario counts', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });
      await engine.initialize();
      await engine.loadPolicies('csv data');
      await engine.loadAssumptions({
        mortality: 'data',
        lapse: 'data',
        expenses: 'data',
      });

      const config: ChunkConfig = {
        numScenarios: 100,
        seed: 42,
        scenarioParams: {
          initialRate: 0.03,
          drift: 0.01,
          volatility: 0.02,
          minRate: 0.0,
          maxRate: 0.1,
        },
      };

      const result = await engine.runChunk(config);

      expect(result.scenarioNpvs.length).toBe(100);
    });
  });

  describe('dispose', () => {
    it('should reset all state', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });
      await engine.initialize();
      await engine.loadPolicies('csv data');
      await engine.loadAssumptions({
        mortality: 'data',
        lapse: 'data',
        expenses: 'data',
      });

      engine.dispose();

      expect(engine.isInitialized).toBe(false);
      expect(engine.hasPolicies).toBe(false);
      expect(engine.hasAssumptions).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should extract Python traceback from errors', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });

      // Mock Pyodide to throw error with traceback
      (globalThis as any).loadPyodide = () => {
        throw new Error('Traceback (most recent call last):\n  File "test.py", line 10\nSyntaxError');
      };

      try {
        await engine.initialize();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(PyodideEngineError);
        expect((error as PyodideEngineError).pythonTraceback).toContain('Traceback');
      }
    });

    it('should provide clear error codes', async () => {
      const engine = new PyodideEngine({ scriptCode: SAMPLE_SCRIPT });

      try {
        await engine.loadPolicies('data');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(PyodideEngineError);
        expect((error as PyodideEngineError).code).toBe('NOT_INITIALIZED');
      }
    });
  });
});
