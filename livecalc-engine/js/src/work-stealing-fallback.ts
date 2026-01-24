/**
 * Work-Stealing Fallback - Auto-selecting worker pool with fallback
 *
 * This module provides a factory function that automatically selects the
 * best worker pool implementation based on environment capabilities:
 *
 * 1. If SharedArrayBuffer is available: Use WorkStealingPool
 * 2. If SAB not available: Fall back to static SABWorkerPool or WorkerPool
 *
 * @module work-stealing-fallback
 */

import type {
  ValuationConfig,
  ValuationResult,
  WorkerProgressCallback,
  Policy,
  MortalityTable,
  LapseTable,
  ExpenseAssumptions,
} from './types.js';
import { isSharedArrayBufferAvailable } from './shared-buffer.js';
import {
  WorkStealingPool,
  NodeWorkStealingPool,
  type WorkStealingPoolConfig,
} from './work-stealing-pool.js';
import {
  SABWorkerPool,
  NodeSABWorkerPool,
  type SABWorkerPoolConfig,
} from './sab-worker-pool.js';
import {
  WorkerPool,
  type WorkerPoolConfig,
} from './worker-pool.js';
import {
  NodeWorkerPool,
} from './node-worker-pool.js';

/**
 * Configuration for the adaptive worker pool
 */
export interface AdaptivePoolConfig {
  /** Number of workers (default: navigator.hardwareConcurrency or 4) */
  numWorkers?: number;
  /** Path to the standard worker script */
  workerScript: string;
  /** Path to the work-stealing worker script (if different) */
  workStealingWorkerScript?: string;
  /** Path to the WASM module */
  wasmPath: string;
  /** Maximum number of policies (default: 100000) */
  maxPolicies?: number;
  /** Maximum number of scenarios (default: 10000) */
  maxScenarios?: number;
  /** Force a specific mode ('work-stealing' | 'sab' | 'basic') */
  forceMode?: 'work-stealing' | 'sab' | 'basic';
  /** Task granularity for work-stealing (scenarios per task) */
  taskGranularity?: number;
}

/**
 * Unified interface for all worker pool implementations
 */
export interface AdaptiveWorkerPool {
  /** Number of workers */
  readonly workerCount: number;
  /** Whether the pool is initialized */
  readonly isInitialized: boolean;
  /** Whether data has been loaded and pool is ready */
  readonly isReady: boolean;
  /** Which mode the pool is using */
  readonly mode: 'work-stealing' | 'sab' | 'basic';

  /** Initialize the pool */
  initialize(): Promise<void>;

  /** Load data from CSV strings */
  loadDataFromCsv(
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string
  ): Promise<void>;

  /** Load data from objects (SAB and work-stealing modes only) */
  loadData?(
    policies: Policy[],
    mortality: MortalityTable,
    lapse: LapseTable,
    expenses: ExpenseAssumptions
  ): Promise<void>;

  /** Run valuation */
  runValuation(
    config: ValuationConfig,
    onProgress?: WorkerProgressCallback
  ): Promise<ValuationResult>;

  /** Cancel current execution */
  cancel(): void;

  /** Terminate and clean up */
  terminate(): void;
}

/**
 * Check which pool mode would be used
 */
export function wouldUseWorkStealing(): boolean {
  return isSharedArrayBufferAvailable();
}

/**
 * Wrapper that adapts WorkerPool to AdaptiveWorkerPool interface
 */
class WorkerPoolAdapter implements AdaptiveWorkerPool {
  private pool: WorkerPool;

  constructor(pool: WorkerPool) {
    this.pool = pool;
  }

  get workerCount(): number {
    return this.pool.workerCount;
  }

  get isInitialized(): boolean {
    return this.pool.isInitialized;
  }

  get isReady(): boolean {
    return this.pool.isReady;
  }

  get mode(): 'work-stealing' | 'sab' | 'basic' {
    return 'basic';
  }

  initialize(): Promise<void> {
    return this.pool.initialize();
  }

  async loadDataFromCsv(
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string
  ): Promise<void> {
    return this.pool.loadData(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
  }

  runValuation(
    config: ValuationConfig,
    onProgress?: WorkerProgressCallback
  ): Promise<ValuationResult> {
    return this.pool.runValuation(config, onProgress);
  }

  cancel(): void {
    this.pool.cancel();
  }

  terminate(): void {
    this.pool.terminate();
  }
}

/**
 * Wrapper that adapts SABWorkerPool to AdaptiveWorkerPool interface
 */
class SABWorkerPoolAdapter implements AdaptiveWorkerPool {
  private pool: SABWorkerPool;

  constructor(pool: SABWorkerPool) {
    this.pool = pool;
  }

  get workerCount(): number {
    return this.pool.workerCount;
  }

  get isInitialized(): boolean {
    return this.pool.isInitialized;
  }

  get isReady(): boolean {
    return this.pool.isReady;
  }

  get mode(): 'work-stealing' | 'sab' | 'basic' {
    return 'sab';
  }

  initialize(): Promise<void> {
    return this.pool.initialize();
  }

  loadDataFromCsv(
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string
  ): Promise<void> {
    return this.pool.loadDataFromCsv(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
  }

  loadData(
    policies: Policy[],
    mortality: MortalityTable,
    lapse: LapseTable,
    expenses: ExpenseAssumptions
  ): Promise<void> {
    return this.pool.loadData(policies, mortality, lapse, expenses);
  }

  runValuation(
    config: ValuationConfig,
    onProgress?: WorkerProgressCallback
  ): Promise<ValuationResult> {
    return this.pool.runValuation(config, onProgress);
  }

  cancel(): void {
    this.pool.cancel();
  }

  terminate(): void {
    this.pool.terminate();
  }
}

/**
 * Wrapper that adapts WorkStealingPool to AdaptiveWorkerPool interface
 */
class WorkStealingPoolAdapter implements AdaptiveWorkerPool {
  private pool: WorkStealingPool;

  constructor(pool: WorkStealingPool) {
    this.pool = pool;
  }

  get workerCount(): number {
    return this.pool.workerCount;
  }

  get isInitialized(): boolean {
    return this.pool.isInitialized;
  }

  get isReady(): boolean {
    return this.pool.isReady;
  }

  get mode(): 'work-stealing' | 'sab' | 'basic' {
    return 'work-stealing';
  }

  initialize(): Promise<void> {
    return this.pool.initialize();
  }

  loadDataFromCsv(
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string
  ): Promise<void> {
    return this.pool.loadDataFromCsv(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
  }

  loadData(
    policies: Policy[],
    mortality: MortalityTable,
    lapse: LapseTable,
    expenses: ExpenseAssumptions
  ): Promise<void> {
    return this.pool.loadData(policies, mortality, lapse, expenses);
  }

  runValuation(
    config: ValuationConfig,
    onProgress?: WorkerProgressCallback
  ): Promise<ValuationResult> {
    return this.pool.runValuation(config, onProgress);
  }

  cancel(): void {
    this.pool.cancel();
  }

  terminate(): void {
    this.pool.terminate();
  }
}

/**
 * Create an adaptive worker pool that automatically selects the best
 * implementation based on environment capabilities.
 *
 * Priority (unless forceMode is specified):
 * 1. WorkStealingPool (if SharedArrayBuffer available)
 * 2. SABWorkerPool (if SharedArrayBuffer available but work-stealing disabled)
 * 3. WorkerPool (fallback for environments without SAB)
 *
 * @example
 * ```typescript
 * const pool = createAdaptivePool({
 *   workerScript: '/livecalc-worker.js',
 *   workStealingWorkerScript: '/livecalc-ws-worker.js',
 *   wasmPath: '/livecalc.mjs',
 * });
 *
 * console.log(`Using ${pool.mode} mode`);
 *
 * await pool.initialize();
 * await pool.loadDataFromCsv(policies, mortality, lapse, expenses);
 *
 * const result = await pool.runValuation({
 *   numScenarios: 10000,
 *   seed: 42,
 *   scenarioParams: DEFAULT_SCENARIO_PARAMS,
 * });
 *
 * pool.terminate();
 * ```
 */
export function createAdaptivePool(config: AdaptivePoolConfig): AdaptiveWorkerPool {
  const isNode = typeof process !== 'undefined' && !!process.versions?.node;
  const hasSab = isSharedArrayBufferAvailable();

  // Determine mode
  let mode: 'work-stealing' | 'sab' | 'basic';
  if (config.forceMode) {
    mode = config.forceMode;
  } else if (hasSab && config.workStealingWorkerScript) {
    mode = 'work-stealing';
  } else if (hasSab) {
    mode = 'sab';
  } else {
    mode = 'basic';
  }

  // Create appropriate pool
  switch (mode) {
    case 'work-stealing': {
      if (!hasSab) {
        console.warn('WorkStealing mode requested but SAB not available, falling back to basic');
        return createBasicPool(config, isNode);
      }
      if (!config.workStealingWorkerScript) {
        console.warn('WorkStealing mode requested but no worker script provided, falling back to SAB');
        return createSabPool(config, isNode);
      }

      const wsConfig: WorkStealingPoolConfig = {
        numWorkers: config.numWorkers,
        workerScript: config.workStealingWorkerScript,
        wasmPath: config.wasmPath,
        maxPolicies: config.maxPolicies,
        maxScenarios: config.maxScenarios,
        taskGranularity: config.taskGranularity,
      };

      const pool = isNode
        ? new NodeWorkStealingPool(wsConfig)
        : new WorkStealingPool(wsConfig);

      return new WorkStealingPoolAdapter(pool);
    }

    case 'sab': {
      if (!hasSab) {
        console.warn('SAB mode requested but SAB not available, falling back to basic');
        return createBasicPool(config, isNode);
      }

      return createSabPool(config, isNode);
    }

    case 'basic':
    default:
      return createBasicPool(config, isNode);
  }
}

function createSabPool(config: AdaptivePoolConfig, isNode: boolean): AdaptiveWorkerPool {
  const sabConfig: SABWorkerPoolConfig = {
    numWorkers: config.numWorkers,
    workerScript: config.workerScript,
    wasmPath: config.wasmPath,
    maxPolicies: config.maxPolicies,
    maxScenarios: config.maxScenarios,
  };

  const pool = isNode
    ? new NodeSABWorkerPool(sabConfig)
    : new SABWorkerPool(sabConfig);

  return new SABWorkerPoolAdapter(pool);
}

function createBasicPool(config: AdaptivePoolConfig, isNode: boolean): AdaptiveWorkerPool {
  const basicConfig: WorkerPoolConfig = {
    numWorkers: config.numWorkers,
    workerScript: config.workerScript,
    wasmPath: config.wasmPath,
  };

  const pool = isNode
    ? new NodeWorkerPool(basicConfig)
    : new WorkerPool(basicConfig);

  return new WorkerPoolAdapter(pool);
}

/**
 * Get information about available pool modes in the current environment
 */
export function getAvailableModes(): {
  workStealing: boolean;
  sab: boolean;
  basic: boolean;
  recommended: 'work-stealing' | 'sab' | 'basic';
} {
  const hasSab = isSharedArrayBufferAvailable();

  return {
    workStealing: hasSab,
    sab: hasSab,
    basic: true,
    recommended: hasSab ? 'work-stealing' : 'basic',
  };
}
