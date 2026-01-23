/**
 * Fallback Module - Auto-selecting worker pool with SAB detection
 *
 * This module provides a unified interface that automatically selects
 * between SharedArrayBuffer mode (zero-copy) and fallback mode (copying).
 *
 * ## Usage
 *
 * ```typescript
 * import { createAutoWorkerPool } from '@livecalc/engine';
 *
 * const pool = createAutoWorkerPool({
 *   numWorkers: 8,
 *   workerScript: '/livecalc-worker.js',
 *   wasmPath: '/livecalc.mjs',
 * });
 *
 * await pool.initialize();
 *
 * // Will use SAB if available, fallback to copying if not
 * console.log('Using SharedArrayBuffer:', pool.usesSharedArrayBuffer);
 *
 * await pool.loadData(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
 * const result = await pool.runValuation(config);
 * ```
 *
 * @module fallback
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
import { WorkerPool, WorkerPoolConfig } from './worker-pool.js';
import { NodeWorkerPool, isNodeEnvironment } from './node-worker-pool.js';
import {
  SABWorkerPool,
  SABWorkerPoolConfig,
  NodeSABWorkerPool,
} from './sab-worker-pool.js';
import { isSharedArrayBufferAvailable } from './shared-buffer.js';

/**
 * Configuration for auto-selecting worker pool
 */
export interface AutoWorkerPoolConfig extends SABWorkerPoolConfig {
  /** Force fallback mode even if SAB is available */
  forceFallback?: boolean;
  /** Prefer SAB mode when available (default: true) */
  preferSharedArrayBuffer?: boolean;
}

/**
 * Unified interface for worker pool operations
 */
export interface UnifiedWorkerPool {
  /** Number of workers in the pool */
  readonly workerCount: number;
  /** Whether the pool is initialized */
  readonly isInitialized: boolean;
  /** Whether data is loaded and pool is ready */
  readonly isReady: boolean;
  /** Whether SharedArrayBuffer is being used */
  readonly usesSharedArrayBuffer: boolean;

  /** Initialize the worker pool */
  initialize(): Promise<void>;

  /** Load data from CSV strings */
  loadDataFromCsv(
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string
  ): Promise<void>;

  /** Load data from objects */
  loadData(
    policies: Policy[],
    mortality: MortalityTable,
    lapse: LapseTable,
    expenses: ExpenseAssumptions
  ): Promise<void>;

  /** Run valuation with optional progress callback */
  runValuation(
    config: ValuationConfig,
    onProgress?: WorkerProgressCallback
  ): Promise<ValuationResult>;

  /** Cancel current valuation */
  cancel(): void;

  /** Terminate all workers */
  terminate(): void;
}

/**
 * Wrapper for standard WorkerPool to implement unified interface
 */
class WorkerPoolWrapper implements UnifiedWorkerPool {
  private pool: WorkerPool;
  private policiesCsv: string = '';
  private mortalityCsv: string = '';
  private lapseCsv: string = '';
  private expensesCsv: string = '';

  constructor(config: WorkerPoolConfig) {
    if (isNodeEnvironment()) {
      this.pool = new NodeWorkerPool(config);
    } else {
      this.pool = new WorkerPool(config);
    }
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

  get usesSharedArrayBuffer(): boolean {
    return false;
  }

  async initialize(): Promise<void> {
    await this.pool.initialize();
  }

  async loadDataFromCsv(
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string
  ): Promise<void> {
    this.policiesCsv = policiesCsv;
    this.mortalityCsv = mortalityCsv;
    this.lapseCsv = lapseCsv;
    this.expensesCsv = expensesCsv;
    await this.pool.loadData(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
  }

  async loadData(
    policies: Policy[],
    mortality: MortalityTable,
    lapse: LapseTable,
    expenses: ExpenseAssumptions
  ): Promise<void> {
    // Convert to CSV for standard WorkerPool
    this.policiesCsv = policiesToCsv(policies);
    this.mortalityCsv = mortalityToCsv(mortality);
    this.lapseCsv = lapseToCsv(lapse);
    this.expensesCsv = expensesToCsv(expenses);
    await this.pool.loadData(
      this.policiesCsv,
      this.mortalityCsv,
      this.lapseCsv,
      this.expensesCsv
    );
  }

  async runValuation(
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
 * Wrapper for SABWorkerPool to implement unified interface
 */
class SABWorkerPoolWrapper implements UnifiedWorkerPool {
  private pool: SABWorkerPool;

  constructor(config: SABWorkerPoolConfig) {
    if (isNodeEnvironment()) {
      this.pool = new NodeSABWorkerPool(config);
    } else {
      this.pool = new SABWorkerPool(config);
    }
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

  get usesSharedArrayBuffer(): boolean {
    return true;
  }

  async initialize(): Promise<void> {
    await this.pool.initialize();
  }

  async loadDataFromCsv(
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string
  ): Promise<void> {
    await this.pool.loadDataFromCsv(
      policiesCsv,
      mortalityCsv,
      lapseCsv,
      expensesCsv
    );
  }

  async loadData(
    policies: Policy[],
    mortality: MortalityTable,
    lapse: LapseTable,
    expenses: ExpenseAssumptions
  ): Promise<void> {
    await this.pool.loadData(policies, mortality, lapse, expenses);
  }

  async runValuation(
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
 * Create a worker pool that automatically selects the best mode.
 *
 * If SharedArrayBuffer is available and not disabled, uses SABWorkerPool
 * for zero-copy data sharing. Otherwise falls back to standard WorkerPool.
 *
 * @param config - Worker pool configuration
 * @returns Unified worker pool interface
 *
 * @example
 * ```typescript
 * const pool = createAutoWorkerPool({
 *   numWorkers: 8,
 *   workerScript: '/livecalc-worker.js',
 *   wasmPath: '/livecalc.mjs',
 * });
 *
 * console.log('SAB mode:', pool.usesSharedArrayBuffer);
 * ```
 */
export function createAutoWorkerPool(
  config: AutoWorkerPoolConfig
): UnifiedWorkerPool {
  const preferSab = config.preferSharedArrayBuffer ?? true;
  const forceFallback = config.forceFallback ?? false;

  const useSab = preferSab && !forceFallback && isSharedArrayBufferAvailable();

  if (useSab) {
    try {
      return new SABWorkerPoolWrapper(config);
    } catch {
      // Fall back if SAB creation fails
      console.warn(
        'SharedArrayBuffer pool creation failed, falling back to standard pool'
      );
    }
  }

  return new WorkerPoolWrapper(config);
}

/**
 * Check if SharedArrayBuffer mode would be used with current settings.
 *
 * @param forceFallback - Whether fallback is forced
 * @returns true if SAB mode would be used
 */
export function wouldUseSharedArrayBuffer(forceFallback = false): boolean {
  return !forceFallback && isSharedArrayBufferAvailable();
}

// ==========================================================================
// Helper functions for CSV conversion (used by fallback wrapper)
// ==========================================================================

function policiesToCsv(policies: Policy[]): string {
  const header = 'policy_id,age,gender,sum_assured,premium,term,product_type';
  const rows = policies.map(
    (p) =>
      `${p.policyId},${p.age},${p.gender},${p.sumAssured},${p.premium},${p.term},${p.productType}`
  );
  return [header, ...rows].join('\n');
}

function mortalityToCsv(mortality: MortalityTable): string {
  const header = 'age,male_qx,female_qx';
  const rows: string[] = [];
  const maxAge = Math.max(mortality.male.length, mortality.female.length);
  for (let age = 0; age < maxAge; age++) {
    const male = mortality.male[age] ?? 0;
    const female = mortality.female[age] ?? 0;
    rows.push(`${age},${male},${female}`);
  }
  return [header, ...rows].join('\n');
}

function lapseToCsv(lapseRates: LapseTable): string {
  const header = 'year,lapse_rate';
  const rows = lapseRates.map((rate, index) => `${index + 1},${rate}`);
  return [header, ...rows].join('\n');
}

function expensesToCsv(expenses: ExpenseAssumptions): string {
  return `parameter,value
per_policy_acquisition,${expenses.perPolicyAcquisition}
per_policy_maintenance,${expenses.perPolicyMaintenance}
percent_of_premium,${expenses.percentOfPremium}
claim_expense,${expenses.claimExpense}`;
}
