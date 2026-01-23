/**
 * WorkerPool - Manages a pool of Web Workers for parallel scenario execution
 *
 * This class distributes valuation work across multiple workers, each running
 * their own WASM instance. Work is distributed by scenario chunks.
 */

import type {
  ValuationConfig,
  ValuationResult,
  ValuationStatistics,
  ScenarioParams,
  WorkerMessage,
  WorkerResponse,
  WorkerProgressCallback,
} from './types.js';

/**
 * Configuration options for the WorkerPool
 */
export interface WorkerPoolConfig {
  /** Number of workers (default: navigator.hardwareConcurrency or 4) */
  numWorkers?: number;
  /** Path to the worker script */
  workerScript: string;
  /** Path to the WASM module */
  wasmPath: string;
}

/**
 * Internal worker state tracking
 */
interface WorkerState {
  worker: Worker;
  busy: boolean;
  scenarioRange: [number, number] | null;
  retryCount: number;
}

/**
 * Result from a single worker
 */
interface WorkerResult {
  scenarioNpvs: number[];
  scenarioRange: [number, number];
  executionTimeMs: number;
}

/**
 * Error class for WorkerPool-specific errors
 */
export class WorkerPoolError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'WorkerPoolError';
  }
}

/**
 * WorkerPool manages parallel execution of valuations across multiple workers.
 *
 * @example
 * ```typescript
 * const pool = new WorkerPool({
 *   numWorkers: 4,
 *   workerScript: '/livecalc-worker.js',
 *   wasmPath: '/livecalc.wasm',
 * });
 *
 * await pool.initialize();
 * await pool.loadData(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
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
export class WorkerPool {
  private workers: WorkerState[] = [];
  private initialized = false;
  private dataLoaded = false;
  private abortController: AbortController | null = null;
  private progressCallback: WorkerProgressCallback | null = null;

  private readonly numWorkers: number;
  private readonly workerScript: string;
  private readonly wasmPath: string;

  // Store CSV data for worker initialization
  private policiesCsv: string = '';
  private mortalityCsv: string = '';
  private lapseCsv: string = '';
  private expensesCsv: string = '';

  constructor(config: WorkerPoolConfig) {
    // Detect number of available CPU cores
    const defaultWorkers =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;

    this.numWorkers = config.numWorkers ?? defaultWorkers;
    this.workerScript = config.workerScript;
    this.wasmPath = config.wasmPath;
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
   * Initialize the worker pool by creating all workers.
   *
   * @throws WorkerPoolError if initialization fails
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new WorkerPoolError(
        'WorkerPool already initialized. Call terminate() first.',
        'ALREADY_INITIALIZED'
      );
    }

    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.numWorkers; i++) {
      const worker = this.createWorker();
      const state: WorkerState = {
        worker,
        busy: false,
        scenarioRange: null,
        retryCount: 0,
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
   * Load data into all workers.
   *
   * @param policiesCsv - CSV string containing policy data
   * @param mortalityCsv - CSV string containing mortality table
   * @param lapseCsv - CSV string containing lapse rates
   * @param expensesCsv - CSV string containing expense assumptions
   * @throws WorkerPoolError if data loading fails
   */
  async loadData(
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string
  ): Promise<void> {
    if (!this.initialized) {
      throw new WorkerPoolError(
        'WorkerPool not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }

    // Store data for potential worker restarts
    this.policiesCsv = policiesCsv;
    this.mortalityCsv = mortalityCsv;
    this.lapseCsv = lapseCsv;
    this.expensesCsv = expensesCsv;

    const loadPromises = this.workers.map((state, index) =>
      this.loadWorkerData(state, index)
    );

    try {
      await Promise.all(loadPromises);
      this.dataLoaded = true;
    } catch (error) {
      throw new WorkerPoolError(
        `Failed to load data into workers: ${error instanceof Error ? error.message : String(error)}`,
        'LOAD_FAILED'
      );
    }
  }

  /**
   * Run valuation across all workers in parallel.
   *
   * Work is distributed by scenario chunks. Each worker processes a subset
   * of scenarios and returns partial results which are aggregated.
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
    if (!this.isReady) {
      throw new WorkerPoolError(
        'WorkerPool not ready. Call initialize() and loadData() first.',
        'NOT_READY'
      );
    }

    this.progressCallback = onProgress ?? null;
    this.abortController = new AbortController();

    const { numScenarios, seed } = config;

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
          BigInt(seed) + BigInt(index), // Different seed per worker for different scenarios
          (percent) => {
            workerProgress[index] = percent;
            this.reportProgress(workerProgress);
          }
        )
      );

      const results = await Promise.all(resultPromises);

      const endTime = performance.now();

      // Aggregate results from all workers
      return this.aggregateResults(results, endTime - startTime);
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
   *
   * Workers will be signaled to stop and the runValuation promise will reject
   * with a cancellation error.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Terminate all workers and clean up resources.
   *
   * After calling terminate(), the pool must be re-initialized before use.
   */
  terminate(): void {
    this.terminateWorkers();
    this.initialized = false;
    this.dataLoaded = false;
    this.policiesCsv = '';
    this.mortalityCsv = '';
    this.lapseCsv = '';
    this.expensesCsv = '';
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
   * Load data into a single worker.
   */
  private loadWorkerData(state: WorkerState, index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${index} data loading timed out`));
      }, 30000);

      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'load-complete') {
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

      const loadMessage: WorkerMessage = {
        type: 'load-data',
        policiesCsv: this.policiesCsv,
        mortalityCsv: this.mortalityCsv,
        lapseCsv: this.lapseCsv,
        expensesCsv: this.expensesCsv,
      };
      state.worker.postMessage(loadMessage);
    });
  }

  /**
   * Calculate scenario chunks for each worker.
   * Distributes scenarios as evenly as possible.
   */
  private calculateScenarioChunks(
    totalScenarios: number
  ): Array<[number, number]> {
    const chunks: Array<[number, number]> = [];
    const baseChunkSize = Math.floor(totalScenarios / this.numWorkers);
    const remainder = totalScenarios % this.numWorkers;

    let start = 0;
    for (let i = 0; i < this.numWorkers; i++) {
      // Distribute remainder scenarios to first workers
      const chunkSize = baseChunkSize + (i < remainder ? 1 : 0);
      const end = start + chunkSize;
      chunks.push([start, end]);
      start = end;
    }

    return chunks;
  }

  /**
   * Execute valuation on a single worker.
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
      // Check for cancellation
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
        }, 120000); // 2 minute timeout per chunk

        const handler = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.type === 'progress') {
            onProgress(event.data.percent);
          } else if (event.data.type === 'result') {
            clearTimeout(timeout);
            state.worker.removeEventListener('message', handler);
            resolve({
              scenarioNpvs: event.data.scenarioNpvs,
              scenarioRange,
              executionTimeMs: event.data.executionTimeMs,
            });
          } else if (event.data.type === 'error') {
            clearTimeout(timeout);
            state.worker.removeEventListener('message', handler);

            if (state.retryCount < 1) {
              state.retryCount++;
              console.warn(
                `Worker ${workerId} error, retrying (attempt ${state.retryCount + 1}): ${event.data.message}`
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

        // Handle abort signal
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
        // Compute unique seed for this worker (as number, not BigInt, for postMessage)
        const workerSeedNumber = Number(workerSeed);
        const runMessage: WorkerMessage = {
          type: 'run-valuation',
          numScenarios: endScenario - startScenario,
          seed: workerSeedNumber,
          scenarioParams: config.scenarioParams,
          mortalityMultiplier: config.mortalityMultiplier ?? 1.0,
          lapseMultiplier: config.lapseMultiplier ?? 1.0,
          expenseMultiplier: config.expenseMultiplier ?? 1.0,
          storeDistribution: true, // Always store for aggregation
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
   * Aggregate results from all workers into a single ValuationResult.
   */
  private aggregateResults(
    results: WorkerResult[],
    totalExecutionTimeMs: number
  ): ValuationResult {
    // Combine all scenario NPVs
    const allNpvs: number[] = [];
    for (const result of results) {
      allNpvs.push(...result.scenarioNpvs);
    }

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

    // CTE 95 - average of worst 5% (lowest values, as these represent losses)
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
