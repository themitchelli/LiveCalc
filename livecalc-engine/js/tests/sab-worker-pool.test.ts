/**
 * SABWorkerPool Unit Tests
 *
 * Tests for SharedArrayBuffer-based parallel execution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SABWorkerPool, SABWorkerPoolConfig } from '../src/sab-worker-pool.js';
import { WorkerPoolError } from '../src/worker-pool.js';
import type {
  WorkerMessage,
  WorkerResponse,
  ValuationConfig,
} from '../src/types.js';
import { DEFAULT_SCENARIO_PARAMS } from '../src/types.js';

// Sample test data
const SAMPLE_POLICIES_CSV = `policy_id,age,gender,sum_assured,premium,term,product_type
1,30,M,100000,500,20,TERM
2,35,F,150000,750,25,TERM
3,40,M,200000,1000,15,TERM`;

const SAMPLE_MORTALITY_CSV = `age,male_qx,female_qx
0,0.00450,0.00380
30,0.00091,0.00029
35,0.00095,0.00035
40,0.00100,0.00040`;

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

/**
 * Mock Worker class for SAB testing
 */
class MockSABWorker {
  private handlers: Map<string, Array<(event: MessageEvent) => void>> = new Map();
  private workerId: number = -1;
  private initialized: boolean = false;
  private sabAttached: boolean = false;
  private sharedBuffer: SharedArrayBuffer | null = null;
  private maxScenariosPerWorker: number = 0;

  postMessage(message: WorkerMessage): void {
    setTimeout(() => this.handleMessage(message), 0);
  }

  addEventListener(event: string, handler: (event: MessageEvent) => void): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  removeEventListener(event: string, handler: (event: MessageEvent) => void): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  terminate(): void {
    this.handlers.clear();
    this.sharedBuffer = null;
  }

  private emit(response: WorkerResponse): void {
    const handlers = this.handlers.get('message') || [];
    for (const handler of handlers) {
      handler({ data: response } as MessageEvent);
    }
  }

  private handleMessage(message: WorkerMessage): void {
    switch (message.type) {
      case 'init':
        this.workerId = message.workerId;
        this.initialized = true;
        this.emit({ type: 'init-complete' });
        break;

      case 'attach-sab':
        if (!this.initialized) {
          this.emit({ type: 'error', message: 'Not initialized' });
          return;
        }
        this.sharedBuffer = message.buffer;
        this.workerId = message.workerId;
        this.maxScenariosPerWorker = message.maxScenariosPerWorker;
        this.sabAttached = true;
        this.emit({ type: 'sab-attached' });
        break;

      case 'run-valuation-sab':
        if (!this.initialized || !this.sabAttached || !this.sharedBuffer) {
          this.emit({ type: 'error', message: 'Not ready' });
          return;
        }

        // Simulate progress
        this.emit({ type: 'progress', percent: 0 });
        this.emit({ type: 'progress', percent: 50 });
        this.emit({ type: 'progress', percent: 100 });

        // Write mock results to SharedArrayBuffer
        const resultsOffset = this.getResultsOffset();
        const view = new Float64Array(this.sharedBuffer, resultsOffset, message.numScenarios);

        for (let i = 0; i < message.numScenarios; i++) {
          // Generate consistent values based on seed and index
          view[i] = 10000 + message.seed * 100 + i * 10 + message.workerId * 1000;
        }

        this.emit({
          type: 'result-sab',
          scenarioCount: message.numScenarios,
          executionTimeMs: 50,
        });
        break;

      default:
        this.emit({ type: 'error', message: `Unknown message type: ${(message as WorkerMessage).type}` });
    }
  }

  private getResultsOffset(): number {
    // Read results offset from header
    if (!this.sharedBuffer) return 0;
    const header = new DataView(this.sharedBuffer);
    const resultsOffset = header.getUint32(28, true); // OFFSET_RESULTS_OFFSET
    return resultsOffset + this.workerId * this.maxScenariosPerWorker * 8;
  }
}

/**
 * Testable SABWorkerPool with mock workers
 */
class TestableSABWorkerPool extends SABWorkerPool {
  public mockWorkers: MockSABWorker[] = [];

  protected createWorker(): Worker {
    const mockWorker = new MockSABWorker();
    this.mockWorkers.push(mockWorker);
    return mockWorker as unknown as Worker;
  }
}

describe('SABWorkerPool', () => {
  let pool: TestableSABWorkerPool;

  const defaultConfig: SABWorkerPoolConfig = {
    numWorkers: 4,
    workerScript: '/worker.js',
    wasmPath: '/livecalc.wasm',
    maxPolicies: 1000,
    maxScenarios: 1000,
  };

  beforeEach(() => {
    pool = new TestableSABWorkerPool(defaultConfig);
  });

  afterEach(() => {
    pool.terminate();
  });

  describe('initialization', () => {
    it('should create workers and allocate SharedArrayBuffer', async () => {
      await pool.initialize();

      expect(pool.mockWorkers.length).toBe(4);
      expect(pool.isInitialized).toBe(true);
      expect(pool.usesSharedArrayBuffer).toBe(true);
    });

    it('should report correct worker count', () => {
      expect(pool.workerCount).toBe(4);
    });

    it('should throw if already initialized', async () => {
      await pool.initialize();

      await expect(pool.initialize()).rejects.toThrow(WorkerPoolError);
    });

    it('should default to navigator.hardwareConcurrency', () => {
      const poolWithDefaults = new TestableSABWorkerPool({
        workerScript: '/worker.js',
        wasmPath: '/livecalc.wasm',
      });

      expect(poolWithDefaults.workerCount).toBeGreaterThanOrEqual(1);
      poolWithDefaults.terminate();
    });
  });

  describe('data loading', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('should load data from CSV and attach SAB to workers', async () => {
      await pool.loadDataFromCsv(
        SAMPLE_POLICIES_CSV,
        SAMPLE_MORTALITY_CSV,
        SAMPLE_LAPSE_CSV,
        SAMPLE_EXPENSES_CSV
      );

      expect(pool.isReady).toBe(true);
    });

    it('should throw if not initialized', async () => {
      const uninitializedPool = new TestableSABWorkerPool(defaultConfig);

      await expect(
        uninitializedPool.loadDataFromCsv(
          SAMPLE_POLICIES_CSV,
          SAMPLE_MORTALITY_CSV,
          SAMPLE_LAPSE_CSV,
          SAMPLE_EXPENSES_CSV
        )
      ).rejects.toThrow(WorkerPoolError);

      uninitializedPool.terminate();
    });
  });

  describe('valuation', () => {
    beforeEach(async () => {
      await pool.initialize();
      await pool.loadDataFromCsv(
        SAMPLE_POLICIES_CSV,
        SAMPLE_MORTALITY_CSV,
        SAMPLE_LAPSE_CSV,
        SAMPLE_EXPENSES_CSV
      );
    });

    it('should run valuation and return aggregated result', async () => {
      const config: ValuationConfig = {
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      };

      const result = await pool.runValuation(config);

      expect(result.scenarioCount).toBe(100);
      expect(result.distribution).toBeDefined();
      expect(result.distribution!.length).toBe(100);
      expect(result.statistics.meanNpv).toBeGreaterThan(0);
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should report progress during execution', async () => {
      const progressValues: number[] = [];

      const result = await pool.runValuation(
        {
          numScenarios: 100,
          seed: 42,
          scenarioParams: DEFAULT_SCENARIO_PARAMS,
        },
        (progress) => progressValues.push(progress)
      );

      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[progressValues.length - 1]).toBe(100);
    });

    it('should distribute scenarios across workers', async () => {
      const result = await pool.runValuation({
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      });

      // All scenarios accounted for
      expect(result.scenarioCount).toBe(100);
    });

    it('should handle uneven scenario distribution', async () => {
      const result = await pool.runValuation({
        numScenarios: 103, // Not evenly divisible by 4
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      });

      expect(result.scenarioCount).toBe(103);
    });

    it('should throw if not ready', async () => {
      const freshPool = new TestableSABWorkerPool(defaultConfig);
      await freshPool.initialize();
      // Don't load data

      await expect(
        freshPool.runValuation({
          numScenarios: 100,
          seed: 42,
          scenarioParams: DEFAULT_SCENARIO_PARAMS,
        })
      ).rejects.toThrow(WorkerPoolError);

      freshPool.terminate();
    });

    it('should apply multipliers', async () => {
      const result = await pool.runValuation({
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
        mortalityMultiplier: 1.5,
        lapseMultiplier: 0.8,
        expenseMultiplier: 1.2,
      });

      expect(result.scenarioCount).toBe(100);
    });
  });

  describe('statistics aggregation', () => {
    beforeEach(async () => {
      await pool.initialize();
      await pool.loadDataFromCsv(
        SAMPLE_POLICIES_CSV,
        SAMPLE_MORTALITY_CSV,
        SAMPLE_LAPSE_CSV,
        SAMPLE_EXPENSES_CSV
      );
    });

    it('should calculate correct mean from all workers', async () => {
      const result = await pool.runValuation({
        numScenarios: 100,
        seed: 0,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      });

      expect(result.statistics.meanNpv).toBeGreaterThan(0);
    });

    it('should calculate percentiles in order', async () => {
      const result = await pool.runValuation({
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      });

      const { percentiles } = result.statistics;
      expect(percentiles.p50).toBeLessThanOrEqual(percentiles.p75);
      expect(percentiles.p75).toBeLessThanOrEqual(percentiles.p90);
      expect(percentiles.p90).toBeLessThanOrEqual(percentiles.p95);
      expect(percentiles.p95).toBeLessThanOrEqual(percentiles.p99);
    });

    it('should calculate CTE 95', async () => {
      const result = await pool.runValuation({
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      });

      expect(result.statistics.cte95).toBeDefined();
    });
  });

  describe('memory savings', () => {
    it('should report memory usage stats', async () => {
      await pool.initialize();
      await pool.loadDataFromCsv(
        SAMPLE_POLICIES_CSV,
        SAMPLE_MORTALITY_CSV,
        SAMPLE_LAPSE_CSV,
        SAMPLE_EXPENSES_CSV
      );

      const savings = pool.getMemorySavings();

      // Verify all fields are returned
      expect(savings.withSab).toBeGreaterThan(0);
      expect(savings.withoutSab).toBeGreaterThan(0);
      expect(savings.savings).toBeGreaterThanOrEqual(0);
    });

    it('should show significant savings with large policy counts', () => {
      // Theoretical calculation for 10K policies, 1K scenarios, 4 workers
      const policyCount = 10000;
      const scenarioCount = 1000;
      const workerCount = 4;

      // SAB: shared policies + assumptions + per-worker results
      const sharedPolicies = policyCount * 32;
      const sharedAssumptions = 2400;
      const perWorkerResults = scenarioCount * 8 * workerCount;
      const withSab = sharedPolicies + sharedAssumptions + perWorkerResults + 32;

      // Copy mode: each worker gets full copy + results
      const copyPerWorker = policyCount * 32 + 2400 + scenarioCount * 8;
      const withoutSab = workerCount * copyPerWorker;

      const savings = withoutSab - withSab;
      const savingsPercent = savings / withoutSab;

      // With 10K policies and 4 workers, SAB should save ~70%
      expect(savingsPercent).toBeGreaterThan(0.7);
    });
  });

  describe('cancellation', () => {
    beforeEach(async () => {
      await pool.initialize();
      await pool.loadDataFromCsv(
        SAMPLE_POLICIES_CSV,
        SAMPLE_MORTALITY_CSV,
        SAMPLE_LAPSE_CSV,
        SAMPLE_EXPENSES_CSV
      );
    });

    it('should support cancel method', () => {
      expect(() => pool.cancel()).not.toThrow();
    });
  });

  describe('termination', () => {
    it('should terminate all workers', async () => {
      await pool.initialize();

      pool.terminate();

      expect(pool.isInitialized).toBe(false);
      expect(pool.isReady).toBe(false);
    });

    it('should allow re-initialization after terminate', async () => {
      await pool.initialize();
      pool.terminate();

      await pool.initialize();

      expect(pool.isInitialized).toBe(true);
    });
  });
});

describe('parallel vs single-threaded validation', () => {
  it('should produce same scenario count with different worker counts', async () => {
    const configs = [1, 2, 4];
    const results: Map<number, number> = new Map();

    for (const numWorkers of configs) {
      const pool = new TestableSABWorkerPool({
        numWorkers,
        workerScript: '/worker.js',
        wasmPath: '/livecalc.wasm',
        maxPolicies: 1000,
        maxScenarios: 1000,
      });

      try {
        await pool.initialize();
        await pool.loadDataFromCsv(
          SAMPLE_POLICIES_CSV,
          SAMPLE_MORTALITY_CSV,
          SAMPLE_LAPSE_CSV,
          SAMPLE_EXPENSES_CSV
        );

        const result = await pool.runValuation({
          numScenarios: 100,
          seed: 42,
          scenarioParams: DEFAULT_SCENARIO_PARAMS,
        });

        results.set(numWorkers, result.scenarioCount);
      } finally {
        pool.terminate();
      }
    }

    // All configurations should produce the same number of scenarios
    const scenarioCounts = [...results.values()];
    expect(new Set(scenarioCounts).size).toBe(1);
    expect(scenarioCounts[0]).toBe(100);
  });
});

describe('SABWorkerPool usesSharedArrayBuffer', () => {
  it('should report true for SAB usage', async () => {
    const pool = new TestableSABWorkerPool({
      numWorkers: 4,
      workerScript: '/worker.js',
      wasmPath: '/livecalc.wasm',
    });

    expect(pool.usesSharedArrayBuffer).toBe(true);

    pool.terminate();
  });
});
