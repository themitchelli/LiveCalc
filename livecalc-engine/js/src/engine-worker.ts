/**
 * EngineWorker - Worker script that uses CalcEngine interface
 *
 * This worker script provides a CalcEngine-agnostic implementation that
 * can work with any engine implementing the CalcEngine interface.
 *
 * For LiveCalc WASM, use the LiveCalcEngineAdapter.
 * For testing, use MockCalcEngine.
 * For future engines, implement CalcEngine and configure accordingly.
 */

import type {
  CalcEngine,
  AssumptionBuffers,
  ChunkConfig,
} from './calc-engine.js';
import type { ScenarioParams } from './types.js';

/**
 * Messages from main thread to engine worker.
 */
export interface EngineWorkerInitMessage {
  type: 'engine-init';
  /** Path to the engine module (or 'mock' for MockCalcEngine) */
  enginePath: string;
  /** Engine type: 'livecalc' | 'mock' | custom */
  engineType: string;
  /** Worker identifier */
  workerId: number;
}

export interface EngineWorkerLoadDataMessage {
  type: 'engine-load-data';
  policiesData: string | ArrayBuffer;
  assumptions: {
    mortality: string | ArrayBuffer;
    lapse: string | ArrayBuffer;
    expenses: string | ArrayBuffer;
  };
}

export interface EngineWorkerRunChunkMessage {
  type: 'engine-run-chunk';
  numScenarios: number;
  seed: number;
  scenarioParams: ScenarioParams;
  mortalityMultiplier: number;
  lapseMultiplier: number;
  expenseMultiplier: number;
}

export interface EngineWorkerDisposeMessage {
  type: 'engine-dispose';
}

export type EngineWorkerMessage =
  | EngineWorkerInitMessage
  | EngineWorkerLoadDataMessage
  | EngineWorkerRunChunkMessage
  | EngineWorkerDisposeMessage;

/**
 * Messages from engine worker to main thread.
 */
export interface EngineWorkerInitCompleteResponse {
  type: 'engine-init-complete';
  engineInfo: {
    name: string;
    version: string;
    maxPolicies: number;
    maxScenariosPerChunk: number;
    supportsBinaryInput: boolean;
  };
}

export interface EngineWorkerLoadCompleteResponse {
  type: 'engine-load-complete';
  policyCount: number;
}

export interface EngineWorkerProgressResponse {
  type: 'engine-progress';
  percent: number;
}

export interface EngineWorkerResultResponse {
  type: 'engine-result';
  scenarioNpvs: Float64Array;
  executionTimeMs: number;
}

export interface EngineWorkerErrorResponse {
  type: 'engine-error';
  message: string;
  code?: string;
}

export interface EngineWorkerDisposedResponse {
  type: 'engine-disposed';
}

export type EngineWorkerResponse =
  | EngineWorkerInitCompleteResponse
  | EngineWorkerLoadCompleteResponse
  | EngineWorkerProgressResponse
  | EngineWorkerResultResponse
  | EngineWorkerErrorResponse
  | EngineWorkerDisposedResponse;

/**
 * EngineWorkerContext manages CalcEngine lifecycle within a worker.
 *
 * This class handles message processing and engine management.
 * It's designed to be used in Web Workers or Node.js worker_threads.
 */
export class EngineWorkerContext {
  private engine: CalcEngine | null = null;
  private workerId: number = -1;

  /**
   * Handle incoming message from main thread.
   */
  async handleMessage(message: EngineWorkerMessage): Promise<EngineWorkerResponse> {
    switch (message.type) {
      case 'engine-init':
        return this.handleInit(message);

      case 'engine-load-data':
        return this.handleLoadData(message);

      case 'engine-run-chunk':
        return this.handleRunChunk(message);

      case 'engine-dispose':
        return this.handleDispose();

      default:
        return {
          type: 'engine-error',
          message: `Unknown message type: ${(message as EngineWorkerMessage).type}`,
        };
    }
  }

  /**
   * Initialize the engine based on the provided type.
   */
  private async handleInit(
    message: EngineWorkerInitMessage
  ): Promise<EngineWorkerResponse> {
    try {
      this.workerId = message.workerId;

      // Create engine based on type
      this.engine = await this.createEngine(message.engineType, message.enginePath);

      // Initialize the engine
      await this.engine.initialize();

      const info = this.engine.getInfo();

      return {
        type: 'engine-init-complete',
        engineInfo: info,
      };
    } catch (error) {
      return {
        type: 'engine-error',
        message: `Failed to initialize engine: ${error instanceof Error ? error.message : String(error)}`,
        code: 'INIT_FAILED',
      };
    }
  }

  /**
   * Load data into the engine.
   */
  private async handleLoadData(
    message: EngineWorkerLoadDataMessage
  ): Promise<EngineWorkerResponse> {
    if (!this.engine || !this.engine.isInitialized) {
      return {
        type: 'engine-error',
        message: 'Engine not initialized',
        code: 'NOT_INITIALIZED',
      };
    }

    try {
      // Load policies
      const policyCount = await this.engine.loadPolicies(message.policiesData);

      // Load assumptions
      const assumptions: AssumptionBuffers = {
        mortality: message.assumptions.mortality,
        lapse: message.assumptions.lapse,
        expenses: message.assumptions.expenses,
      };
      await this.engine.loadAssumptions(assumptions);

      return {
        type: 'engine-load-complete',
        policyCount,
      };
    } catch (error) {
      return {
        type: 'engine-error',
        message: `Failed to load data: ${error instanceof Error ? error.message : String(error)}`,
        code: 'LOAD_FAILED',
      };
    }
  }

  /**
   * Run a valuation chunk.
   */
  private async handleRunChunk(
    message: EngineWorkerRunChunkMessage
  ): Promise<EngineWorkerResponse> {
    if (!this.engine || !this.engine.isInitialized) {
      return {
        type: 'engine-error',
        message: 'Engine not initialized',
        code: 'NOT_INITIALIZED',
      };
    }

    if (!this.engine.hasPolicies || !this.engine.hasAssumptions) {
      return {
        type: 'engine-error',
        message: 'Data not loaded',
        code: 'DATA_NOT_LOADED',
      };
    }

    try {
      const config: ChunkConfig = {
        numScenarios: message.numScenarios,
        seed: message.seed,
        scenarioParams: message.scenarioParams,
        mortalityMultiplier: message.mortalityMultiplier,
        lapseMultiplier: message.lapseMultiplier,
        expenseMultiplier: message.expenseMultiplier,
      };

      const result = await this.engine.runChunk(config);

      return {
        type: 'engine-result',
        scenarioNpvs: result.scenarioNpvs,
        executionTimeMs: result.executionTimeMs,
      };
    } catch (error) {
      return {
        type: 'engine-error',
        message: `Chunk execution failed: ${error instanceof Error ? error.message : String(error)}`,
        code: 'RUN_FAILED',
      };
    }
  }

  /**
   * Dispose the engine and clean up.
   */
  private handleDispose(): EngineWorkerResponse {
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    return { type: 'engine-disposed' };
  }

  /**
   * Create an engine instance based on type.
   */
  private async createEngine(
    engineType: string,
    enginePath: string
  ): Promise<CalcEngine> {
    switch (engineType) {
      case 'livecalc': {
        // Dynamically import the LiveCalc adapter and WASM module
        const [adapterModule, wasmModule] = await Promise.all([
          import('./livecalc-adapter.js'),
          import(/* @vite-ignore */ enginePath),
        ]);

        const createModule = wasmModule.default || wasmModule.createLiveCalcModule;
        if (typeof createModule !== 'function') {
          throw new Error(
            'WASM module factory not found. Expected default export or createLiveCalcModule.'
          );
        }

        return new adapterModule.LiveCalcEngineAdapter({ createModule });
      }

      case 'pyodide': {
        // Use Pyodide engine for Python scripts
        const pyodideModule = await import('./engines/pyodide-engine.js');

        // enginePath should contain the Python script code
        // In a real scenario, this would be loaded from a file or passed in config
        const config = {
          scriptCode: enginePath, // For now, pass script directly
          packages: [], // Additional packages loaded on demand
        };

        return new pyodideModule.PyodideEngine(config);
      }

      case 'mock': {
        // Use mock engine for testing
        const mockModule = await import('./mock-engine.js');
        return new mockModule.MockCalcEngine();
      }

      default:
        throw new Error(`Unknown engine type: ${engineType}`);
    }
  }

  /**
   * Get the current engine (for testing/debugging).
   */
  getEngine(): CalcEngine | null {
    return this.engine;
  }
}

// Export for direct use
export { EngineWorkerContext as default };
