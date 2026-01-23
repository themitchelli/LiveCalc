/**
 * SABWorkerPool - Worker pool with SharedArrayBuffer zero-copy data sharing
 *
 * This class extends WorkerPool to use SharedArrayBuffer for sharing policy
 * and assumption data between workers without copying.
 *
 * ## Memory Savings
 *
 * With N workers and P policies:
 * - Without SAB: N × P × 32 bytes (data copied to each worker)
 * - With SAB: P × 32 bytes (shared by all workers)
 *
 * For 100K policies and 8 workers:
 * - Without SAB: ~25.6 MB
 * - With SAB: ~3.2 MB
 * - Savings: ~22 MB (87.5% reduction)
 *
 * ## Browser Requirements
 *
 * SharedArrayBuffer requires cross-origin isolation headers:
 * - Cross-Origin-Opener-Policy: same-origin
 * - Cross-Origin-Embedder-Policy: require-corp
 *
 * @module sab-worker-pool
 */

import type {
  ValuationConfig,
  ValuationResult,
  ValuationStatistics,
  WorkerMessage,
  WorkerResponse,
  WorkerProgressCallback,
  Policy,
  MortalityTable,
  LapseTable,
  ExpenseAssumptions,
} from './types.js';
import { WorkerPoolError } from './worker-pool.js';
import {
  SharedBufferManager,
  isSharedArrayBufferAvailable,
  calculateBufferSize,
} from './shared-buffer.js';

/**
 * Configuration options for the SABWorkerPool
 */
export interface SABWorkerPoolConfig {
  /** Number of workers (default: navigator.hardwareConcurrency or 4) */
  numWorkers?: number;
  /** Path to the worker script */
  workerScript: string;
  /** Path to the WASM module */
  wasmPath: string;
  /** Maximum number of policies (default: 100000) */
  maxPolicies?: number;
  /** Maximum number of scenarios (default: 10000) */
  maxScenarios?: number;
}

/**
 * Internal worker state tracking
 */
interface WorkerState {
  worker: Worker;
  busy: boolean;
  scenarioRange: [number, number] | null;
  retryCount: number;
  sabAttached: boolean;
}

/**
 * Result from a single worker
 */
interface WorkerResult {
  scenarioCount: number;
  scenarioRange: [number, number];
  executionTimeMs: number;
}

/**
 * SABWorkerPool provides parallel execution with SharedArrayBuffer data sharing.
 *
 * @example
 * ```typescript
 * const pool = new SABWorkerPool({
 *   numWorkers: 8,
 *   workerScript: '/livecalc-worker.js',
 *   wasmPath: '/livecalc.mjs',
 *   maxPolicies: 100000,
 *   maxScenarios: 10000,
 * });
 *
 * await pool.initialize();
 *
 * // Load data into shared buffer (zero-copy to workers)
 * await pool.loadDataFromCsv(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
 *
 * const result = await pool.runValuation({
 *   numScenarios: 1000,
 *   seed: 42,
 *   scenarioParams: DEFAULT_SCENARIO_PARAMS,
 * }, (progress) => console.log(`${progress}% complete`));
 *
 * pool.terminate();
 * ```
 */
export class SABWorkerPool {
  private workers: WorkerState[] = [];
  private initialized = false;
  private dataLoaded = false;
  private abortController: AbortController | null = null;
  private progressCallback: WorkerProgressCallback | null = null;

  private readonly numWorkers: number;
  private readonly workerScript: string;
  private readonly wasmPath: string;
  private readonly maxPolicies: number;
  private readonly maxScenarios: number;

  // SharedArrayBuffer manager
  private sharedBufferManager: SharedBufferManager | null = null;

  constructor(config: SABWorkerPoolConfig) {
    if (!isSharedArrayBufferAvailable()) {
      throw new WorkerPoolError(
        'SharedArrayBuffer is not available. ' +
        'In browsers, ensure cross-origin isolation headers are set.',
        'SAB_NOT_AVAILABLE'
      );
    }

    // Detect number of available CPU cores
    const defaultWorkers =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;

    this.numWorkers = config.numWorkers ?? defaultWorkers;
    this.workerScript = config.workerScript;
    this.wasmPath = config.wasmPath;
    this.maxPolicies = config.maxPolicies ?? 100000;
    this.maxScenarios = config.maxScenarios ?? 10000;
  }

  /**
   * Get the number of workers in the pool
   */
  get workerCount(): number {
    return this.numWorkers;
  }

  /**
   * Check if the pool is initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if data has been loaded
   */
  get isReady(): boolean {
    return this.initialized && this.dataLoaded;
  }

  /**
   * Check if SharedArrayBuffer is being used.
   * Returns true for SABWorkerPool instances (this class always uses SAB).
   */
  get usesSharedArrayBuffer(): boolean {
    return true;
  }

  /**
   * Get estimated memory savings compared to non-SAB mode.
   *
   * Compares memory usage of:
   * - SAB mode: Shared policies + per-worker results
   * - Copy mode: Full data copied to each worker
   *
   * Note: Savings are only significant with large policy counts.
   * With few policies, the fixed overhead of SAB buffer may exceed copy mode.
   */
  getMemorySavings(): { withSab: number; withoutSab: number; savings: number } {
    const policyCount = this.sharedBufferManager?.policyCount ?? 0;

    // SAB memory: shared policies + shared assumptions + per-worker results + header
    const sharedPolicies = policyCount * 32;
    const sharedAssumptions = 121 * 2 * 8 + 50 * 8 + 4 * 8; // ~2400 bytes
    const perWorkerResults = this.maxScenarios * 8 * this.numWorkers;
    const header = 32;
    const withSab = sharedPolicies + sharedAssumptions + perWorkerResults + header;

    // Copy mode: each worker gets a full copy of policies + assumptions
    // Plus each worker needs space for its own results
    const copyPoliciesPerWorker = policyCount * 32;
    const copyAssumptionsPerWorker = sharedAssumptions;
    const copyResultsPerWorker = this.maxScenarios * 8;
    const withoutSab = this.numWorkers * (copyPoliciesPerWorker + copyAssumptionsPerWorker + copyResultsPerWorker);

    return {
      withSab,
      withoutSab,
      savings: Math.max(0, withoutSab - withSab),
    };
  }

  /**
   * Initialize the worker pool by creating all workers.
   *
   * @throws WorkerPoolError if initialization fails
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new WorkerPoolError(
        'SABWorkerPool already initialized. Call terminate() first.',
        'ALREADY_INITIALIZED'
      );
    }

    // Allocate SharedArrayBuffer
    this.sharedBufferManager = new SharedBufferManager({
      maxPolicies: this.maxPolicies,
      maxScenarios: this.maxScenarios,
      workerCount: this.numWorkers,
    });

    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.numWorkers; i++) {
      const worker = this.createWorker();
      const state: WorkerState = {
        worker,
        busy: false,
        scenarioRange: null,
        retryCount: 0,
        sabAttached: false,
      };
      this.workers.push(state);

      // Initialize each worker with WASM module
      initPromises.push(this.initializeWorker(state, i));
    }

    try {
      await Promise.all(initPromises);
      this.initialized = true;
    } catch (error) {
      // Clean up any workers that were created
      this.terminateWorkers();
      throw new WorkerPoolError(
        `Failed to initialize workers: ${error instanceof Error ? error.message : String(error)}`,
        'INIT_FAILED'
      );
    }
  }

  /**
   * Load data from CSV strings into the shared buffer.
   * All workers will share this data without copying.
   *
   * @param policiesCsv - CSV string containing policy data
   * @param mortalityCsv - CSV string containing mortality table
   * @param lapseCsv - CSV string containing lapse rates
   * @param expensesCsv - CSV string containing expense assumptions
   * @throws WorkerPoolError if data loading fails
   */
  async loadDataFromCsv(
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string
  ): Promise<void> {
    if (!this.initialized || !this.sharedBufferManager) {
      throw new WorkerPoolError(
        'SABWorkerPool not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }

    // Write data to shared buffer
    this.sharedBufferManager.writePoliciesFromCsv(policiesCsv);
    this.sharedBufferManager.writeMortalityFromCsv(mortalityCsv);
    this.sharedBufferManager.writeLapseFromCsv(lapseCsv);
    this.sharedBufferManager.writeExpensesFromCsv(expensesCsv);

    // Attach shared buffer to all workers
    const attachPromises = this.workers.map((state, index) =>
      this.attachSabToWorker(state, index)
    );

    try {
      await Promise.all(attachPromises);
      this.dataLoaded = true;
    } catch (error) {
      throw new WorkerPoolError(
        `Failed to attach shared buffer to workers: ${error instanceof Error ? error.message : String(error)}`,
        'SAB_ATTACH_FAILED'
      );
    }
  }

  /**
   * Load data from objects into the shared buffer.
   *
   * @param policies - Array of Policy objects
   * @param mortality - Mortality table
   * @param lapse - Lapse rates
   * @param expenses - Expense assumptions
   */
  async loadData(
    policies: Policy[],
    mortality: MortalityTable,
    lapse: LapseTable,
    expenses: ExpenseAssumptions
  ): Promise<void> {
    if (!this.initialized || !this.sharedBufferManager) {
      throw new WorkerPoolError(
        'SABWorkerPool not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }

    // Write data to shared buffer
    this.sharedBufferManager.writePolicies(policies);
    this.sharedBufferManager.writeMortality(mortality);
    this.sharedBufferManager.writeLapse(lapse);
    this.sharedBufferManager.writeExpenses(expenses);

    // Attach shared buffer to all workers
    const attachPromises = this.workers.map((state, index) =>
      this.attachSabToWorker(state, index)
    );

    try {
      await Promise.all(attachPromises);
      this.dataLoaded = true;
    } catch (error) {
      throw new WorkerPoolError(
        `Failed to attach shared buffer to workers: ${error instanceof Error ? error.message : String(error)}`,
        'SAB_ATTACH_FAILED'
      );
    }
  }

  /**
   * Run valuation across all workers in parallel.
   * Results are written directly to SharedArrayBuffer.
   *
   * @param config - Valuation configuration
   * @param onProgress - Optional callback for progress updates (0-100)
   * @returns Aggregated valuation result
   * @throws WorkerPoolError if valuation fails
   */
  async runValuation(
    config: ValuationConfig,
    onProgress?: WorkerProgressCallback
  ): Promise<ValuationResult> {
    if (!this.isReady || !this.sharedBufferManager) {
      throw new WorkerPoolError(
        'SABWorkerPool not ready. Call initialize() and loadData() first.',
        'NOT_READY'
      );
    }

    this.progressCallback = onProgress ?? null;
    this.abortController = new AbortController();

    const { numScenarios, seed } = config;

    // Set scenario count in shared buffer
    this.sharedBufferManager.setScenarioCount(numScenarios);

    // Calculate scenario chunks for each worker
    const chunks = this.calculateScenarioChunks(numScenarios);

    // Track progress per worker
    const workerProgress = new Array(this.numWorkers).fill(0);
    const startTime = performance.now();

    try {
      // Execute valuation on all workers in parallel
      const resultPromises = chunks.map((chunk, index) =>
        this.executeOnWorker(
          this.workers[index],
          index,
          chunk,
          config,
          BigInt(seed) + BigInt(index), // Different seed per worker
          (percent) => {
            workerProgress[index] = percent;
            this.reportProgress(workerProgress);
          }
        )
      );

      const results = await Promise.all(resultPromises);

      const endTime = performance.now();

      // Aggregate results from SharedArrayBuffer
      const scenariosPerWorker = results.map(r => r.scenarioCount);
      return this.aggregateResults(results, scenariosPerWorker, endTime - startTime);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WorkerPoolError('Valuation was cancelled', 'CANCELLED');
      }
      throw error;
    } finally {
      this.abortController = null;
      this.progressCallback = null;

      // Mark all workers as not busy
      this.workers.forEach((state) => {
        state.busy = false;
        state.scenarioRange = null;
      });
    }
  }

  /**
   * Cancel the current valuation execution.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Terminate all workers and clean up resources.
   */
  terminate(): void {
    this.terminateWorkers();
    this.initialized = false;
    this.dataLoaded = false;
    this.sharedBufferManager = null;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Create a new worker instance.
   * Override this method for Node.js compatibility.
   */
  protected createWorker(): Worker {
    return new Worker(this.workerScript, { type: 'module' });
  }

  /**
   * Initialize a single worker with the WASM module.
   */
  private initializeWorker(state: WorkerState, index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${index} initialization timed out`));
      }, 30000);

      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'init-complete') {
          clearTimeout(timeout);
          state.worker.removeEventListener('message', handler);
          resolve();
        } else if (event.data.type === 'error') {
          clearTimeout(timeout);
          state.worker.removeEventListener('message', handler);
          reject(new Error(event.data.message));
        }
      };

      state.worker.addEventListener('message', handler);
      state.worker.addEventListener('error', (e) => {
        clearTimeout(timeout);
        reject(new Error(`Worker ${index} error: ${e.message}`));
      });

      // Send init message
      const initMessage: WorkerMessage = {
        type: 'init',
        wasmPath: this.wasmPath,
        workerId: index,
      };
      state.worker.postMessage(initMessage);
    });
  }

  /**
   * Attach SharedArrayBuffer to a worker.
   */
  private attachSabToWorker(state: WorkerState, index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${index} SAB attach timed out`));
      }, 30000);

      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'sab-attached') {
          clearTimeout(timeout);
          state.worker.removeEventListener('message', handler);
          state.sabAttached = true;
          resolve();
        } else if (event.data.type === 'error') {
          clearTimeout(timeout);
          state.worker.removeEventListener('message', handler);
          reject(new Error(event.data.message));
        }
      };

      state.worker.addEventListener('message', handler);

      const attachMessage: WorkerMessage = {
        type: 'attach-sab',
        buffer: this.sharedBufferManager!.buffer,
        workerId: index,
        maxScenariosPerWorker: Math.ceil(this.maxScenarios / this.numWorkers),
      };
      state.worker.postMessage(attachMessage);
    });
  }

  /**
   * Calculate scenario chunks for each worker.
   */
  private calculateScenarioChunks(
    totalScenarios: number
  ): Array<[number, number]> {
    const chunks: Array<[number, number]> = [];
    const baseChunkSize = Math.floor(totalScenarios / this.numWorkers);
    const remainder = totalScenarios % this.numWorkers;

    let start = 0;
    for (let i = 0; i < this.numWorkers; i++) {
      const chunkSize = baseChunkSize + (i < remainder ? 1 : 0);
      const end = start + chunkSize;
      chunks.push([start, end]);
      start = end;
    }

    return chunks;
  }

  /**
   * Execute valuation on a single worker using SharedArrayBuffer.
   */
  private executeOnWorker(
    state: WorkerState,
    workerId: number,
    scenarioRange: [number, number],
    config: ValuationConfig,
    workerSeed: bigint,
    onProgress: (percent: number) => void
  ): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      if (this.abortController?.signal.aborted) {
        reject(new DOMException('Cancelled', 'AbortError'));
        return;
      }

      state.busy = true;
      state.scenarioRange = scenarioRange;
      state.retryCount = 0;

      const executeWithRetry = () => {
        const timeout = setTimeout(() => {
          if (state.retryCount < 1) {
            state.retryCount++;
            console.warn(
              `Worker ${workerId} timed out, retrying (attempt ${state.retryCount + 1})`
            );
            executeWithRetry();
          } else {
            reject(
              new WorkerPoolError(
                `Worker ${workerId} timed out after retries`,
                'WORKER_TIMEOUT'
              )
            );
          }
        }, 120000);

        const handler = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.type === 'progress') {
            onProgress(event.data.percent);
          } else if (event.data.type === 'result-sab') {
            clearTimeout(timeout);
            state.worker.removeEventListener('message', handler);
            resolve({
              scenarioCount: event.data.scenarioCount,
              scenarioRange,
              executionTimeMs: event.data.executionTimeMs,
            });
          } else if (event.data.type === 'error') {
            clearTimeout(timeout);
            state.worker.removeEventListener('message', handler);

            if (state.retryCount < 1) {
              state.retryCount++;
              console.warn(
                `Worker ${workerId} error, retrying: ${event.data.message}`
              );
              executeWithRetry();
            } else {
              reject(
                new WorkerPoolError(
                  `Worker ${workerId} failed: ${event.data.message}`,
                  'WORKER_FAILED'
                )
              );
            }
          }
        };

        const abortHandler = () => {
          clearTimeout(timeout);
          state.worker.removeEventListener('message', handler);
          reject(new DOMException('Cancelled', 'AbortError'));
        };

        this.abortController?.signal.addEventListener('abort', abortHandler, {
          once: true,
        });

        state.worker.addEventListener('message', handler);

        const [startScenario, endScenario] = scenarioRange;
        const runMessage: WorkerMessage = {
          type: 'run-valuation-sab',
          numScenarios: endScenario - startScenario,
          seed: Number(workerSeed),
          scenarioParams: config.scenarioParams,
          mortalityMultiplier: config.mortalityMultiplier ?? 1.0,
          lapseMultiplier: config.lapseMultiplier ?? 1.0,
          expenseMultiplier: config.expenseMultiplier ?? 1.0,
          workerId,
        };
        state.worker.postMessage(runMessage);
      };

      executeWithRetry();
    });
  }

  /**
   * Report aggregated progress from all workers.
   */
  private reportProgress(workerProgress: number[]): void {
    if (this.progressCallback) {
      const total = workerProgress.reduce((sum, p) => sum + p, 0);
      const avgProgress = Math.round(total / workerProgress.length);
      this.progressCallback(avgProgress);
    }
  }

  /**
   * Aggregate results from SharedArrayBuffer.
   */
  private aggregateResults(
    results: WorkerResult[],
    scenariosPerWorker: number[],
    totalExecutionTimeMs: number
  ): ValuationResult {
    // Read all scenario NPVs from SharedArrayBuffer
    const allNpvs = this.sharedBufferManager!.readAllResults(
      this.numWorkers,
      scenariosPerWorker
    );

    // Sort for percentile calculations
    const sorted = [...allNpvs].sort((a, b) => a - b);
    const n = sorted.length;

    // Calculate statistics
    const mean = allNpvs.reduce((sum, v) => sum + v, 0) / n;

    const variance =
      allNpvs.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Percentile helper using linear interpolation
    const percentile = (p: number): number => {
      const rank = (p / 100) * (n - 1);
      const lower = Math.floor(rank);
      const upper = Math.ceil(rank);
      const weight = rank - lower;
      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    // CTE 95 - average of worst 5%
    const cteCount = Math.max(1, Math.floor(n * 0.05));
    const cte95 =
      sorted.slice(0, cteCount).reduce((sum, v) => sum + v, 0) / cteCount;

    const statistics: ValuationStatistics = {
      meanNpv: mean,
      stdDev,
      percentiles: {
        p50: percentile(50),
        p75: percentile(75),
        p90: percentile(90),
        p95: percentile(95),
        p99: percentile(99),
      },
      cte95,
    };

    return {
      statistics,
      executionTimeMs: totalExecutionTimeMs,
      scenarioCount: n,
      distribution: allNpvs,
    };
  }

  /**
   * Terminate all workers.
   */
  private terminateWorkers(): void {
    for (const state of this.workers) {
      state.worker.terminate();
    }
    this.workers = [];
  }
}

/**
 * Node.js-specific SAB worker pool using worker_threads.
 */
export class NodeSABWorkerPool extends SABWorkerPool {
  protected createWorker(): Worker {
    // Dynamic import to avoid issues in browser environments
    const { Worker: NodeWorker } = require('node:worker_threads');
    const nodeWorker = new NodeWorker(
      (this as unknown as { workerScript: string }).workerScript
    );

    // Create Web Worker-compatible wrapper
    const wrapper = {
      postMessage: (data: unknown) => nodeWorker.postMessage(data),
      addEventListener: (
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === 'message') {
          nodeWorker.on('message', (data: unknown) => {
            const eventHandler = handler as (event: MessageEvent) => void;
            eventHandler({ data } as MessageEvent);
          });
        } else if (event === 'error') {
          nodeWorker.on('error', (err: Error) => {
            const eventHandler = handler as (event: ErrorEvent) => void;
            eventHandler({ message: err.message } as ErrorEvent);
          });
        }
      },
      removeEventListener: () => {},
      terminate: () => {
        nodeWorker.terminate();
      },
    };

    return wrapper as unknown as Worker;
  }
}

/**
 * Create a SABWorkerPool appropriate for the current environment.
 */
export function createSABWorkerPool(config: SABWorkerPoolConfig): SABWorkerPool {
  if (typeof process !== 'undefined' && process.versions?.node) {
    return new NodeSABWorkerPool(config);
  }
  return new SABWorkerPool(config);
}
