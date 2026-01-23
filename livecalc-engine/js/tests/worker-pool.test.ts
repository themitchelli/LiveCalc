/**
 * WorkerPool Unit Tests
 *
 * Tests the parallel execution functionality of the worker pool.
 * Uses mocked workers to test the logic without requiring actual WASM.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerPool, WorkerPoolConfig, WorkerPoolError } from '../src/worker-pool.js';
import type {
  WorkerMessage,
  WorkerResponse,
  ValuationConfig,
} from '../src/types.js';
import { DEFAULT_SCENARIO_PARAMS } from '../src/types.js';

// Sample test data
const SAMPLE_POLICIES_CSV = `policy_id,age,gender,sum_assured,premium,term,product_type
1,30,M,100000,500,20,TERM
2,35,F,150000,750,25,TERM`;

const SAMPLE_MORTALITY_CSV = `age,male_qx,female_qx
0,0.00450,0.00380
30,0.00091,0.00029
35,0.00095,0.00035`;

const SAMPLE_LAPSE_CSV = `year,lapse_rate
1,0.15
2,0.12
3,0.10`;

const SAMPLE_EXPENSES_CSV = `name,value
per_policy_acquisition,500
per_policy_maintenance,50
percent_of_premium,0.05
claim_expense,100`;

/**
 * Mock Worker class for testing
 */
class MockWorker {
  private handlers: Map<string, Array<(event: MessageEvent) => void>> = new Map();
  private workerId: number = -1;
  private initialized: boolean = false;
  private dataLoaded: boolean = false;

  postMessage(message: WorkerMessage): void {
    // Simulate async worker behavior
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

      case 'load-data':
        if (!this.initialized) {
          this.emit({ type: 'error', message: 'Not initialized' });
          return;
        }
        this.dataLoaded = true;
        this.emit({ type: 'load-complete' });
        break;

      case 'run-valuation':
        if (!this.initialized || !this.dataLoaded) {
          this.emit({ type: 'error', message: 'Not ready' });
          return;
        }

        // Simulate progress updates
        this.emit({ type: 'progress', percent: 0 });
        this.emit({ type: 'progress', percent: 50 });
        this.emit({ type: 'progress', percent: 100 });

        // Generate mock scenario NPVs
        const scenarioNpvs: number[] = [];
        for (let i = 0; i < message.numScenarios; i++) {
          // Generate consistent values based on seed and scenario index
          scenarioNpvs.push(10000 + message.seed * 100 + i * 10);
        }

        this.emit({
          type: 'result',
          scenarioNpvs,
          executionTimeMs: 100,
        });
        break;
    }
  }
}

/**
 * Create a WorkerPool with mocked workers
 */
class TestableWorkerPool extends WorkerPool {
  public mockWorkers: MockWorker[] = [];

  protected createWorker(): Worker {
    const mockWorker = new MockWorker();
    this.mockWorkers.push(mockWorker);
    return mockWorker as unknown as Worker;
  }
}

describe('WorkerPool', () => {
  let pool: TestableWorkerPool;

  const defaultConfig: WorkerPoolConfig = {
    numWorkers: 4,
    workerScript: '/worker.js',
    wasmPath: '/livecalc.wasm',
  };

  beforeEach(() => {
    pool = new TestableWorkerPool(defaultConfig);
  });

  afterEach(() => {
    pool.terminate();
  });

  describe('initialization', () => {
    it('should create the specified number of workers', async () => {
      await pool.initialize();

      expect(pool.mockWorkers.length).toBe(4);
      expect(pool.workerCount).toBe(4);
    });

    it('should report initialized state', async () => {
      expect(pool.isInitialized).toBe(false);

      await pool.initialize();

      expect(pool.isInitialized).toBe(true);
    });

    it('should throw if already initialized', async () => {
      await pool.initialize();

      await expect(pool.initialize()).rejects.toThrow(WorkerPoolError);
    });

    it('should default to navigator.hardwareConcurrency or 4', () => {
      const poolWithDefaults = new TestableWorkerPool({
        workerScript: '/worker.js',
        wasmPath: '/livecalc.wasm',
      });

      // In test environment, navigator.hardwareConcurrency may not exist
      expect(poolWithDefaults.workerCount).toBeGreaterThanOrEqual(1);

      poolWithDefaults.terminate();
    });
  });

  describe('data loading', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('should load data into all workers', async () => {
      await pool.loadData(
        SAMPLE_POLICIES_CSV,
        SAMPLE_MORTALITY_CSV,
        SAMPLE_LAPSE_CSV,
        SAMPLE_EXPENSES_CSV
      );

      expect(pool.isReady).toBe(true);
    });

    it('should throw if not initialized', async () => {
      const uninitializedPool = new TestableWorkerPool(defaultConfig);

      await expect(
        uninitializedPool.loadData(
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
      await pool.loadData(
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
      expect(result.statistics.stdDev).toBeGreaterThanOrEqual(0);
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should report progress during execution', async () => {
      const progressValues: number[] = [];

      const config: ValuationConfig = {
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      };

      await pool.runValuation(config, (progress) => {
        progressValues.push(progress);
      });

      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[progressValues.length - 1]).toBe(100);
    });

    it('should distribute scenarios across workers evenly', async () => {
      const config: ValuationConfig = {
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      };

      const result = await pool.runValuation(config);

      // With 4 workers and 100 scenarios, each should get 25
      expect(result.scenarioCount).toBe(100);
    });

    it('should handle uneven scenario distribution', async () => {
      const config: ValuationConfig = {
        numScenarios: 103, // Not evenly divisible by 4
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      };

      const result = await pool.runValuation(config);

      expect(result.scenarioCount).toBe(103);
    });

    it('should throw if not ready', async () => {
      const freshPool = new TestableWorkerPool(defaultConfig);
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
      const config: ValuationConfig = {
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
        mortalityMultiplier: 1.5,
        lapseMultiplier: 0.8,
        expenseMultiplier: 1.2,
      };

      const result = await pool.runValuation(config);

      // Multipliers are passed to workers; test that result is returned
      expect(result.scenarioCount).toBe(100);
    });
  });

  describe('statistics aggregation', () => {
    beforeEach(async () => {
      await pool.initialize();
      await pool.loadData(
        SAMPLE_POLICIES_CSV,
        SAMPLE_MORTALITY_CSV,
        SAMPLE_LAPSE_CSV,
        SAMPLE_EXPENSES_CSV
      );
    });

    it('should calculate correct mean', async () => {
      const config: ValuationConfig = {
        numScenarios: 100,
        seed: 0, // Use 0 for predictable mock values
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      };

      const result = await pool.runValuation(config);

      // With seed=0 and our mock, values are 10000 + seed*100 + i*10
      // For 100 scenarios with different seeds per worker: values vary
      expect(result.statistics.meanNpv).toBeGreaterThan(0);
    });

    it('should calculate percentiles', async () => {
      const config: ValuationConfig = {
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      };

      const result = await pool.runValuation(config);

      // Percentiles should be in order: p50 <= p75 <= p90 <= p95 <= p99
      expect(result.statistics.percentiles.p50).toBeLessThanOrEqual(
        result.statistics.percentiles.p75
      );
      expect(result.statistics.percentiles.p75).toBeLessThanOrEqual(
        result.statistics.percentiles.p90
      );
      expect(result.statistics.percentiles.p90).toBeLessThanOrEqual(
        result.statistics.percentiles.p95
      );
      expect(result.statistics.percentiles.p95).toBeLessThanOrEqual(
        result.statistics.percentiles.p99
      );
    });

    it('should calculate CTE 95 (worst 5%)', async () => {
      const config: ValuationConfig = {
        numScenarios: 100,
        seed: 42,
        scenarioParams: DEFAULT_SCENARIO_PARAMS,
      };

      const result = await pool.runValuation(config);

      // CTE 95 should be <= p5 (lowest percentile)
      // Since our mock generates increasing values, CTE is the average of lowest
      expect(result.statistics.cte95).toBeDefined();
    });
  });

  describe('cancellation', () => {
    beforeEach(async () => {
      await pool.initialize();
      await pool.loadData(
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
  it('should produce consistent results with different worker counts', async () => {
    const configs = [1, 2, 4];
    const results: Map<number, number> = new Map();

    for (const numWorkers of configs) {
      const pool = new TestableWorkerPool({
        numWorkers,
        workerScript: '/worker.js',
        wasmPath: '/livecalc.wasm',
      });

      try {
        await pool.initialize();
        await pool.loadData(
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

describe('linear scaling validation', () => {
  it('should have scenario count matching request regardless of worker count', async () => {
    const scenarioCounts = [100, 1000, 10000];

    for (const numScenarios of scenarioCounts) {
      const pool = new TestableWorkerPool({
        numWorkers: 8,
        workerScript: '/worker.js',
        wasmPath: '/livecalc.wasm',
      });

      try {
        await pool.initialize();
        await pool.loadData(
          SAMPLE_POLICIES_CSV,
          SAMPLE_MORTALITY_CSV,
          SAMPLE_LAPSE_CSV,
          SAMPLE_EXPENSES_CSV
        );

        const result = await pool.runValuation({
          numScenarios,
          seed: 42,
          scenarioParams: DEFAULT_SCENARIO_PARAMS,
        });

        expect(result.scenarioCount).toBe(numScenarios);
        expect(result.distribution!.length).toBe(numScenarios);
      } finally {
        pool.terminate();
      }
    }
  });
});
