/**
 * NodeWorkerPool - Worker pool implementation for Node.js using worker_threads
 *
 * This class extends WorkerPool to use Node.js worker_threads instead of
 * Web Workers, enabling parallel execution in server-side environments.
 */

import { Worker as NodeWorker } from 'node:worker_threads';
import { WorkerPool, WorkerPoolConfig } from './worker-pool.js';

/**
 * Configuration options for NodeWorkerPool
 */
export interface NodeWorkerPoolConfig extends Omit<WorkerPoolConfig, 'workerScript'> {
  /** Path to the worker script (must be a .js or .mjs file) */
  workerScript: string;
}

/**
 * NodeWorkerPool provides parallel valuation execution using Node.js worker_threads.
 *
 * @example
 * ```typescript
 * import { NodeWorkerPool } from '@livecalc/engine';
 *
 * const pool = new NodeWorkerPool({
 *   numWorkers: 4,
 *   workerScript: './dist/node-worker.mjs',
 *   wasmPath: './wasm/livecalc.mjs',
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
export class NodeWorkerPool extends WorkerPool {
  /**
   * Create a Node.js worker using worker_threads.
   *
   * @override
   */
  protected createWorker(): Worker {
    // Create a Node.js worker that wraps with Web Worker-compatible interface
    // TypeScript doesn't know about worker_threads Worker shape, so we cast
    // Note: Node.js worker_threads uses 'eval: false' for file-based workers
    // The worker script should use .mjs extension for ES modules
    const nodeWorker = new NodeWorker(
      (this as unknown as { workerScript: string }).workerScript
    );

    // Create a Web Worker-compatible wrapper
    const wrapper = {
      postMessage: (data: unknown) => nodeWorker.postMessage(data),
      addEventListener: (
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === 'message') {
          nodeWorker.on('message', (data: unknown) => {
            // Wrap data in MessageEvent-like object
            const eventHandler = handler as (
              event: MessageEvent
            ) => void;
            eventHandler({ data } as MessageEvent);
          });
        } else if (event === 'error') {
          nodeWorker.on('error', (err: Error) => {
            const eventHandler = handler as (
              event: ErrorEvent
            ) => void;
            eventHandler({ message: err.message } as ErrorEvent);
          });
        }
      },
      removeEventListener: (
        _event: string,
        _handler: EventListenerOrEventListenerObject
      ) => {
        // Node.js worker_threads doesn't have removeListener for wrapped handlers
        // This is a limitation but acceptable for our use case
      },
      terminate: () => {
        nodeWorker.terminate();
      },
    };

    return wrapper as unknown as Worker;
  }
}

/**
 * Detect if running in Node.js environment
 */
export function isNodeEnvironment(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null
  );
}

/**
 * Create a WorkerPool appropriate for the current environment.
 * Returns NodeWorkerPool in Node.js, or standard WorkerPool in browsers.
 */
export function createWorkerPool(config: WorkerPoolConfig): WorkerPool {
  if (isNodeEnvironment()) {
    return new NodeWorkerPool(config);
  }
  return new WorkerPool(config);
}
