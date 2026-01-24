/**
 * WorkStealingPool - Worker pool with dynamic work-stealing scheduler
 *
 * This class implements a work-stealing scheduler that dynamically balances
 * workload across workers. Instead of statically partitioning scenarios upfront,
 * tasks are distributed dynamically:
 *
 * 1. Initial distribution: Tasks are evenly distributed to worker deques
 * 2. Workers process their local deques (LIFO for cache locality)
 * 3. Idle workers steal from random victims (FIFO for fairness)
 * 4. Termination: When all workers are idle and all deques are empty
 *
 * ## Benefits over Static Partitioning
 *
 * - Eliminates "long-tail" wait times when some workers finish early
 * - Adapts to heterogeneous task execution times
 * - Better CPU utilization (>90% until completion)
 *
 * ## Memory Layout
 *
 * Uses SharedArrayBuffer for lock-free communication:
 * - Deque pool: Per-worker double-ended queues
 * - Results buffer: Per-task NPV results
 * - State flags: Termination detection
 *
 * @module work-stealing-pool
 */

import type {
  ValuationConfig,
  ValuationResult,
  ValuationStatistics,
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
} from './shared-buffer.js';
import {
  WorkStealingDequePool,
  WorkStealingDeque,
  DequeResult,
} from './work-stealing-deque.js';

/**
 * Configuration for the WorkStealingPool
 */
export interface WorkStealingPoolConfig {
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
  /** Task granularity: scenarios per task (default: auto-calculated) */
  taskGranularity?: number;
}

/**
 * Internal worker state tracking
 */
interface WorkerState {
  worker: Worker;
  busy: boolean;
  tasksCompleted: number;
  tasksStolen: number;
  retryCount: number;
  sabAttached: boolean;
  dequeAttached: boolean;
}

/**
 * Task definition for work stealing
 */
interface Task {
  /** Task ID (unique within a run) */
  taskId: number;
  /** Starting scenario index for this task */
  scenarioStart: number;
  /** Ending scenario index (exclusive) */
  scenarioEnd: number;
}

/**
 * Message types for work-stealing workers
 */
export interface WorkStealingWorkerInitMessage {
  type: 'ws-init';
  wasmPath: string;
  workerId: number;
}

export interface WorkStealingWorkerAttachMessage {
  type: 'ws-attach';
  dataBuffer: SharedArrayBuffer;
  dequeBuffer: SharedArrayBuffer;
  resultsBuffer: SharedArrayBuffer;
  workerId: number;
  workerCount: number;
  dequeCapacity: number;
  maxScenariosPerTask: number;
}

export interface WorkStealingWorkerRunMessage {
  type: 'ws-run';
  seed: number;
  scenarioParams: ValuationConfig['scenarioParams'];
  mortalityMultiplier: number;
  lapseMultiplier: number;
  expenseMultiplier: number;
  totalScenarios: number;
  taskGranularity: number;
}

export type WorkStealingWorkerMessage =
  | WorkStealingWorkerInitMessage
  | WorkStealingWorkerAttachMessage
  | WorkStealingWorkerRunMessage;

export interface WorkStealingWorkerInitResponse {
  type: 'ws-init-complete';
}

export interface WorkStealingWorkerAttachResponse {
  type: 'ws-attach-complete';
}

export interface WorkStealingWorkerProgressResponse {
  type: 'ws-progress';
  tasksCompleted: number;
  tasksStolen: number;
}

export interface WorkStealingWorkerResultResponse {
  type: 'ws-result';
  scenariosComputed: number;
  executionTimeMs: number;
  tasksCompleted: number;
  tasksStolen: number;
}

export interface WorkStealingWorkerErrorResponse {
  type: 'ws-error';
  message: string;
}

export type WorkStealingWorkerResponse =
  | WorkStealingWorkerInitResponse
  | WorkStealingWorkerAttachResponse
  | WorkStealingWorkerProgressResponse
  | WorkStealingWorkerResultResponse
  | WorkStealingWorkerErrorResponse;

/**
 * WorkStealingPool provides parallel execution with dynamic work stealing.
 *
 * @example
 * ```typescript
 * const pool = new WorkStealingPool({
 *   numWorkers: 8,
 *   workerScript: '/livecalc-ws-worker.js',
 *   wasmPath: '/livecalc.mjs',
 *   maxPolicies: 100000,
 *   maxScenarios: 10000,
 * });
 *
 * await pool.initialize();
 * await pool.loadDataFromCsv(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
 *
 * const result = await pool.runValuation({
 *   numScenarios: 10000,
 *   seed: 42,
 *   scenarioParams: DEFAULT_SCENARIO_PARAMS,
 * }, (progress) => console.log(`${progress}% complete`));
 *
 * pool.terminate();
 * ```
 */
export class WorkStealingPool {
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
  private readonly taskGranularity: number | 'auto';

  // SharedArrayBuffers
  private dataBufferManager: SharedBufferManager | null = null;
  private dequePool: WorkStealingDequePool | null = null;
  private resultsBuffer: SharedArrayBuffer | null = null;

  constructor(config: WorkStealingPoolConfig) {
    if (!isSharedArrayBufferAvailable()) {
      throw new WorkerPoolError(
        'SharedArrayBuffer is not available. ' +
        'WorkStealingPool requires SharedArrayBuffer for lock-free communication. ' +
        'In browsers, ensure cross-origin isolation headers are set.',
        'SAB_NOT_AVAILABLE'
      );
    }

    const defaultWorkers =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;

    this.numWorkers = config.numWorkers ?? defaultWorkers;
    this.workerScript = config.workerScript;
    this.wasmPath = config.wasmPath;
    this.maxPolicies = config.maxPolicies ?? 100000;
    this.maxScenarios = config.maxScenarios ?? 10000;
    this.taskGranularity = config.taskGranularity ?? 'auto';
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
   * Initialize the worker pool.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new WorkerPoolError(
        'WorkStealingPool already initialized. Call terminate() first.',
        'ALREADY_INITIALIZED'
      );
    }

    // Allocate data buffer
    this.dataBufferManager = new SharedBufferManager({
      maxPolicies: this.maxPolicies,
      maxScenarios: this.maxScenarios,
      workerCount: this.numWorkers,
    });

    // Allocate deque pool (capacity = max scenarios to allow fine-grained tasks)
    const dequeCapacity = Math.ceil(this.maxScenarios / 10); // 10 scenarios per task baseline
    this.dequePool = new WorkStealingDequePool(this.numWorkers, dequeCapacity);

    // Allocate results buffer (scenario NPVs)
    // Each scenario result is 8 bytes (Float64)
    this.resultsBuffer = new SharedArrayBuffer(this.maxScenarios * 8);

    // Create and initialize workers
    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.numWorkers; i++) {
      const worker = this.createWorker();
      const state: WorkerState = {
        worker,
        busy: false,
        tasksCompleted: 0,
        tasksStolen: 0,
        retryCount: 0,
        sabAttached: false,
        dequeAttached: false,
      };
      this.workers.push(state);
      initPromises.push(this.initializeWorker(state, i));
    }

    try {
      await Promise.all(initPromises);
      this.initialized = true;
    } catch (error) {
      this.terminateWorkers();
      throw new WorkerPoolError(
        `Failed to initialize workers: ${error instanceof Error ? error.message : String(error)}`,
        'INIT_FAILED'
      );
    }
  }

  /**
   * Load data from CSV strings.
   */
  async loadDataFromCsv(
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string
  ): Promise<void> {
    if (!this.initialized || !this.dataBufferManager || !this.dequePool || !this.resultsBuffer) {
      throw new WorkerPoolError(
        'WorkStealingPool not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }

    // Write data to shared buffer
    this.dataBufferManager.writePoliciesFromCsv(policiesCsv);
    this.dataBufferManager.writeMortalityFromCsv(mortalityCsv);
    this.dataBufferManager.writeLapseFromCsv(lapseCsv);
    this.dataBufferManager.writeExpensesFromCsv(expensesCsv);

    // Attach buffers to all workers
    const attachPromises = this.workers.map((state, index) =>
      this.attachBuffersToWorker(state, index)
    );

    try {
      await Promise.all(attachPromises);
      this.dataLoaded = true;
    } catch (error) {
      throw new WorkerPoolError(
        `Failed to attach buffers to workers: ${error instanceof Error ? error.message : String(error)}`,
        'ATTACH_FAILED'
      );
    }
  }

  /**
   * Load data from objects.
   */
  async loadData(
    policies: Policy[],
    mortality: MortalityTable,
    lapse: LapseTable,
    expenses: ExpenseAssumptions
  ): Promise<void> {
    if (!this.initialized || !this.dataBufferManager || !this.dequePool || !this.resultsBuffer) {
      throw new WorkerPoolError(
        'WorkStealingPool not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }

    // Write data to shared buffer
    this.dataBufferManager.writePolicies(policies);
    this.dataBufferManager.writeMortality(mortality);
    this.dataBufferManager.writeLapse(lapse);
    this.dataBufferManager.writeExpenses(expenses);

    // Attach buffers to all workers
    const attachPromises = this.workers.map((state, index) =>
      this.attachBuffersToWorker(state, index)
    );

    try {
      await Promise.all(attachPromises);
      this.dataLoaded = true;
    } catch (error) {
      throw new WorkerPoolError(
        `Failed to attach buffers to workers: ${error instanceof Error ? error.message : String(error)}`,
        'ATTACH_FAILED'
      );
    }
  }

  /**
   * Run valuation with work-stealing scheduler.
   */
  async runValuation(
    config: ValuationConfig,
    onProgress?: WorkerProgressCallback
  ): Promise<ValuationResult> {
    if (!this.isReady || !this.dataBufferManager || !this.dequePool || !this.resultsBuffer) {
      throw new WorkerPoolError(
        'WorkStealingPool not ready. Call initialize() and loadData() first.',
        'NOT_READY'
      );
    }

    this.progressCallback = onProgress ?? null;
    this.abortController = new AbortController();

    const { numScenarios, seed } = config;

    // Calculate task granularity (scenarios per task)
    const taskGranularity = this.calculateTaskGranularity(numScenarios);

    // Distribute initial tasks to worker deques
    this.distributeInitialTasks(numScenarios, taskGranularity);

    // Reset deque pool state
    this.dequePool.resetActiveWorkers();

    // Set scenario count
    this.dataBufferManager.setScenarioCount(numScenarios);

    // Reset worker stats
    this.workers.forEach(state => {
      state.tasksCompleted = 0;
      state.tasksStolen = 0;
    });

    const startTime = performance.now();

    try {
      // Execute valuation on all workers
      const resultPromises = this.workers.map((state, index) =>
        this.executeOnWorker(state, index, config, taskGranularity)
      );

      const results = await Promise.all(resultPromises);

      const endTime = performance.now();

      // Aggregate results
      return this.aggregateResults(numScenarios, results, endTime - startTime);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WorkerPoolError('Valuation was cancelled', 'CANCELLED');
      }
      throw error;
    } finally {
      this.abortController = null;
      this.progressCallback = null;

      this.workers.forEach(state => {
        state.busy = false;
      });
    }
  }

  /**
   * Cancel the current valuation.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Terminate all workers.
   */
  terminate(): void {
    this.terminateWorkers();
    this.initialized = false;
    this.dataLoaded = false;
    this.dataBufferManager = null;
    this.dequePool = null;
    this.resultsBuffer = null;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  protected createWorker(): Worker {
    return new Worker(this.workerScript, { type: 'module' });
  }

  private initializeWorker(state: WorkerState, index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${index} initialization timed out`));
      }, 30000);

      const handler = (event: MessageEvent<WorkStealingWorkerResponse>) => {
        if (event.data.type === 'ws-init-complete') {
          clearTimeout(timeout);
          state.worker.removeEventListener('message', handler);
          resolve();
        } else if (event.data.type === 'ws-error') {
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

      const initMessage: WorkStealingWorkerInitMessage = {
        type: 'ws-init',
        wasmPath: this.wasmPath,
        workerId: index,
      };
      state.worker.postMessage(initMessage);
    });
  }

  private attachBuffersToWorker(state: WorkerState, index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${index} buffer attach timed out`));
      }, 30000);

      const handler = (event: MessageEvent<WorkStealingWorkerResponse>) => {
        if (event.data.type === 'ws-attach-complete') {
          clearTimeout(timeout);
          state.worker.removeEventListener('message', handler);
          state.sabAttached = true;
          state.dequeAttached = true;
          resolve();
        } else if (event.data.type === 'ws-error') {
          clearTimeout(timeout);
          state.worker.removeEventListener('message', handler);
          reject(new Error(event.data.message));
        }
      };

      state.worker.addEventListener('message', handler);

      const attachMessage: WorkStealingWorkerAttachMessage = {
        type: 'ws-attach',
        dataBuffer: this.dataBufferManager!.buffer,
        dequeBuffer: this.dequePool!.getBuffer(),
        resultsBuffer: this.resultsBuffer!,
        workerId: index,
        workerCount: this.numWorkers,
        dequeCapacity: this.dequePool!.getDequeCapacity(),
        maxScenariosPerTask: Math.ceil(this.maxScenarios / 10),
      };
      state.worker.postMessage(attachMessage);
    });
  }

  private calculateTaskGranularity(numScenarios: number): number {
    if (this.taskGranularity !== 'auto') {
      return this.taskGranularity;
    }

    // Auto-calculate based on number of scenarios and workers
    // Goal: Have enough tasks for work stealing to be effective, but not so many
    // that task overhead dominates
    //
    // Heuristics:
    // - Minimum 4 tasks per worker (allows for stealing)
    // - Maximum 100 scenarios per task (to keep tasks reasonably sized)
    // - Minimum 10 scenarios per task (to avoid excessive overhead)

    const tasksPerWorker = 4;
    const targetTasks = this.numWorkers * tasksPerWorker;
    const granularity = Math.ceil(numScenarios / targetTasks);

    // Clamp to reasonable range
    return Math.max(10, Math.min(100, granularity));
  }

  private distributeInitialTasks(numScenarios: number, taskGranularity: number): void {
    if (!this.dequePool) {
      throw new Error('Deque pool not initialized');
    }

    // Create tasks
    const tasks: Task[] = [];
    let scenarioIndex = 0;
    let taskId = 0;

    while (scenarioIndex < numScenarios) {
      const end = Math.min(scenarioIndex + taskGranularity, numScenarios);
      tasks.push({
        taskId,
        scenarioStart: scenarioIndex,
        scenarioEnd: end,
      });
      taskId++;
      scenarioIndex = end;
    }

    // Distribute tasks round-robin to worker deques
    // This provides initial even distribution; work stealing handles imbalance
    for (let i = 0; i < tasks.length; i++) {
      const workerId = i % this.numWorkers;
      const deque = this.dequePool.getDeque(workerId, true);

      // Encode task as: (scenarioStart << 16) | (scenarioEnd - scenarioStart)
      // This allows up to 65535 scenario start and 65535 scenarios per task
      const encodedTask = (tasks[i].scenarioStart << 16) | (tasks[i].scenarioEnd - tasks[i].scenarioStart);
      const result = deque.push(encodedTask);

      if (result !== DequeResult.SUCCESS) {
        throw new WorkerPoolError(
          `Failed to push task to worker ${workerId} deque: ${result}`,
          'DEQUE_FULL'
        );
      }
    }
  }

  private executeOnWorker(
    state: WorkerState,
    workerId: number,
    config: ValuationConfig,
    taskGranularity: number
  ): Promise<{
    scenariosComputed: number;
    executionTimeMs: number;
    tasksCompleted: number;
    tasksStolen: number;
  }> {
    return new Promise((resolve, reject) => {
      if (this.abortController?.signal.aborted) {
        reject(new DOMException('Cancelled', 'AbortError'));
        return;
      }

      state.busy = true;
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
        }, 300000); // 5 minute timeout for work stealing

        const handler = (event: MessageEvent<WorkStealingWorkerResponse>) => {
          if (event.data.type === 'ws-progress') {
            state.tasksCompleted = event.data.tasksCompleted;
            state.tasksStolen = event.data.tasksStolen;
            this.reportProgress();
          } else if (event.data.type === 'ws-result') {
            clearTimeout(timeout);
            state.worker.removeEventListener('message', handler);
            resolve({
              scenariosComputed: event.data.scenariosComputed,
              executionTimeMs: event.data.executionTimeMs,
              tasksCompleted: event.data.tasksCompleted,
              tasksStolen: event.data.tasksStolen,
            });
          } else if (event.data.type === 'ws-error') {
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

        const runMessage: WorkStealingWorkerRunMessage = {
          type: 'ws-run',
          seed: config.seed + workerId, // Different seed per worker
          scenarioParams: config.scenarioParams,
          mortalityMultiplier: config.mortalityMultiplier ?? 1.0,
          lapseMultiplier: config.lapseMultiplier ?? 1.0,
          expenseMultiplier: config.expenseMultiplier ?? 1.0,
          totalScenarios: config.numScenarios,
          taskGranularity,
        };
        state.worker.postMessage(runMessage);
      };

      executeWithRetry();
    });
  }

  private reportProgress(): void {
    if (this.progressCallback) {
      // Calculate total progress based on tasks completed
      const totalTasksCompleted = this.workers.reduce(
        (sum, w) => sum + w.tasksCompleted,
        0
      );
      const totalStolen = this.workers.reduce(
        (sum, w) => sum + w.tasksStolen,
        0
      );

      // Estimate total tasks (rough approximation)
      // A more accurate approach would track total tasks distributed
      const avgTasksPerWorker = totalTasksCompleted / Math.max(1, this.workers.filter(w => w.tasksCompleted > 0).length);
      const estimatedTotalTasks = this.numWorkers * Math.max(avgTasksPerWorker, 1);

      const progress = Math.min(100, Math.round((totalTasksCompleted / estimatedTotalTasks) * 100));
      this.progressCallback(progress);
    }
  }

  private aggregateResults(
    totalScenarios: number,
    workerResults: Array<{
      scenariosComputed: number;
      executionTimeMs: number;
      tasksCompleted: number;
      tasksStolen: number;
    }>,
    totalExecutionTimeMs: number
  ): ValuationResult {
    // Read all scenario NPVs from results buffer
    const resultsView = new Float64Array(this.resultsBuffer!, 0, totalScenarios);
    const allNpvs = Array.from(resultsView);

    // Sort for percentile calculations
    const sorted = [...allNpvs].sort((a, b) => a - b);
    const n = sorted.length;

    // Calculate statistics
    const mean = allNpvs.reduce((sum, v) => sum + v, 0) / n;

    const variance =
      allNpvs.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Percentile helper
    const percentile = (p: number): number => {
      const rank = (p / 100) * (n - 1);
      const lower = Math.floor(rank);
      const upper = Math.ceil(rank);
      const weight = rank - lower;
      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    // CTE 95
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

    // Log work stealing stats for debugging
    const totalTasksCompleted = workerResults.reduce((s, r) => s + r.tasksCompleted, 0);
    const totalTasksStolen = workerResults.reduce((s, r) => s + r.tasksStolen, 0);
    const stealRate = totalTasksStolen / Math.max(1, totalTasksCompleted) * 100;

    console.debug(`Work stealing stats: ${totalTasksCompleted} tasks completed, ${totalTasksStolen} stolen (${stealRate.toFixed(1)}%)`);

    return {
      statistics,
      executionTimeMs: totalExecutionTimeMs,
      scenarioCount: n,
      distribution: allNpvs,
    };
  }

  private terminateWorkers(): void {
    for (const state of this.workers) {
      state.worker.terminate();
    }
    this.workers = [];
  }
}

/**
 * Node.js-specific WorkStealingPool
 */
export class NodeWorkStealingPool extends WorkStealingPool {
  protected createWorker(): Worker {
    const { Worker: NodeWorker } = require('node:worker_threads');
    const nodeWorker = new NodeWorker(
      (this as unknown as { workerScript: string }).workerScript
    );

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
 * Create a WorkStealingPool appropriate for the current environment.
 */
export function createWorkStealingPool(config: WorkStealingPoolConfig): WorkStealingPool {
  if (typeof process !== 'undefined' && process.versions?.node) {
    return new NodeWorkStealingPool(config);
  }
  return new WorkStealingPool(config);
}
