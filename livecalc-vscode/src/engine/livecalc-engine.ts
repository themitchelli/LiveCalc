/**
 * LiveCalc Engine Wrapper for VS Code Extension
 *
 * This module provides the integration layer between the VS Code extension
 * and the LiveCalc WASM engine, handling:
 * - Engine initialization and lifecycle management
 * - Worker pool creation based on CPU cores
 * - Progress reporting during valuation
 * - Cancellation support
 * - Memory cleanup
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../logging/logger';
import type { LiveCalcConfig, ValuationResult, ProgressCallback } from '../types';

// We import the engine types but load the actual module dynamically
// This is because the WASM module needs to be loaded at runtime
type CreateLiveCalcModule = import('@livecalc/engine').CreateLiveCalcModule;
type ScenarioParams = import('@livecalc/engine').ScenarioParams;
type EngineValuationConfig = import('@livecalc/engine').ValuationConfig;
type EngineValuationResult = import('@livecalc/engine').ValuationResult;

/**
 * Engine state enum for tracking lifecycle
 */
export enum EngineState {
  Uninitialized = 'uninitialized',
  Initializing = 'initializing',
  Ready = 'ready',
  Running = 'running',
  Error = 'error',
  Disposed = 'disposed',
}

/**
 * Engine error class for LiveCalc-specific errors
 */
export class EngineError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

/**
 * LiveCalcEngineManager - Singleton manager for the WASM engine
 *
 * Handles lazy initialization, worker pool management, and resource cleanup.
 */
export class LiveCalcEngineManager implements vscode.Disposable {
  private static instance: LiveCalcEngineManager | null = null;

  private state: EngineState = EngineState.Uninitialized;
  private engine: any = null; // LiveCalcEngine instance
  private extensionPath: string = '';
  private initPromise: Promise<void> | null = null;
  private currentCancellation: vscode.CancellationToken | null = null;
  private aborted = false;

  // Event emitters for lifecycle events
  private readonly _onDidInitialize = new vscode.EventEmitter<void>();
  public readonly onDidInitialize = this._onDidInitialize.event;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  public readonly onDidDispose = this._onDidDispose.event;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): LiveCalcEngineManager {
    if (!LiveCalcEngineManager.instance) {
      LiveCalcEngineManager.instance = new LiveCalcEngineManager();
    }
    return LiveCalcEngineManager.instance;
  }

  /**
   * Set the extension path (required before initialization)
   */
  setExtensionPath(extensionPath: string): void {
    this.extensionPath = extensionPath;
  }

  /**
   * Get current engine state
   */
  getState(): EngineState {
    return this.state;
  }

  /**
   * Check if engine is ready for valuation
   */
  isReady(): boolean {
    return this.state === EngineState.Ready;
  }

  /**
   * Initialize the engine (lazy initialization)
   *
   * This method is idempotent - calling it multiple times will only
   * initialize once, and subsequent calls will wait for the first
   * initialization to complete.
   */
  async initialize(): Promise<void> {
    // If already initializing, wait for that to complete
    if (this.initPromise) {
      return this.initPromise;
    }

    // If already initialized, return immediately
    if (this.state === EngineState.Ready) {
      return;
    }

    // If disposed, cannot reinitialize
    if (this.state === EngineState.Disposed) {
      throw new EngineError(
        'Engine has been disposed and cannot be reinitialized',
        'ENGINE_DISPOSED'
      );
    }

    // Start initialization
    this.state = EngineState.Initializing;
    logger.info('Initializing LiveCalc engine...');

    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
      this.state = EngineState.Ready;
      logger.info('LiveCalc engine initialized successfully');
      this._onDidInitialize.fire();
    } catch (error) {
      this.state = EngineState.Error;
      this.initPromise = null;
      throw error;
    }
  }

  /**
   * Internal initialization logic
   */
  private async doInitialize(): Promise<void> {
    if (!this.extensionPath) {
      throw new EngineError(
        'Extension path not set. Call setExtensionPath() first.',
        'NO_EXTENSION_PATH'
      );
    }

    try {
      // Dynamically import the engine module
      const { LiveCalcEngine } = await import('@livecalc/engine');

      // Get path to the WASM module
      const wasmPath = path.join(this.extensionPath, 'dist', 'wasm', 'livecalc.mjs');

      // Create the WASM module factory
      // The livecalc.mjs is an ES module that exports a default factory function
      const createModule: CreateLiveCalcModule = async () => {
        // Use dynamic import to load the Emscripten module
        const wasmModule = await import(wasmPath);
        return wasmModule.default();
      };

      // Create and initialize the engine
      this.engine = new LiveCalcEngine();
      await this.engine.initialize(createModule);

      logger.debug(`Engine version: ${this.engine.getVersion?.() || 'unknown'}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize engine: ${message}`);
      throw new EngineError(
        `Failed to initialize WASM engine: ${message}`,
        'INIT_FAILED'
      );
    }
  }

  /**
   * Run a valuation with the given data
   *
   * @param config - LiveCalc configuration from config file
   * @param policiesCsv - Policy data as CSV string
   * @param mortalityCsv - Mortality table as CSV string
   * @param lapseCsv - Lapse table as CSV string
   * @param expensesCsv - Expense assumptions as CSV string
   * @param progressCallback - Optional callback for progress updates
   * @param cancellationToken - Optional cancellation token
   * @returns ValuationResult
   */
  async runValuation(
    config: LiveCalcConfig,
    policiesCsv: string,
    mortalityCsv: string,
    lapseCsv: string,
    expensesCsv: string,
    progressCallback?: ProgressCallback,
    cancellationToken?: vscode.CancellationToken
  ): Promise<ValuationResult> {
    // Ensure engine is initialized
    await this.initialize();

    if (this.state !== EngineState.Ready) {
      throw new EngineError(
        `Engine not ready. Current state: ${this.state}`,
        'ENGINE_NOT_READY'
      );
    }

    // Set up cancellation
    this.currentCancellation = cancellationToken || null;
    this.aborted = false;

    if (cancellationToken) {
      cancellationToken.onCancellationRequested(() => {
        this.aborted = true;
        logger.info('Valuation cancellation requested');
      });
    }

    this.state = EngineState.Running;
    const startTime = Date.now();

    try {
      // Check for cancellation before starting
      this.checkCancellation();

      // Report progress: Loading data
      progressCallback?.(5);
      logger.debug('Loading policy data...');

      // Load policy data
      const policyCount = this.engine.loadPoliciesFromCsv(policiesCsv);
      logger.info(`Loaded ${policyCount} policies`);

      this.checkCancellation();
      progressCallback?.(15);

      // Load assumption data
      logger.debug('Loading mortality table...');
      this.engine.loadMortalityFromCsv(mortalityCsv);

      this.checkCancellation();
      progressCallback?.(25);

      logger.debug('Loading lapse table...');
      this.engine.loadLapseFromCsv(lapseCsv);

      this.checkCancellation();
      progressCallback?.(35);

      logger.debug('Loading expense assumptions...');
      this.engine.loadExpensesFromCsv(expensesCsv);

      this.checkCancellation();
      progressCallback?.(40);

      // Build valuation config from LiveCalcConfig
      const scenarioParams: ScenarioParams = {
        initialRate: config.scenarios.interestRate.initial,
        drift: config.scenarios.interestRate.drift,
        volatility: config.scenarios.interestRate.volatility,
        minRate: config.scenarios.interestRate.minRate ?? 0.0,
        maxRate: config.scenarios.interestRate.maxRate ?? 0.15,
      };

      const valuationConfig: EngineValuationConfig = {
        numScenarios: config.scenarios.count,
        seed: config.scenarios.seed,
        scenarioParams,
        storeDistribution: config.output?.showDistribution ?? false,
      };

      logger.info(
        `Running valuation: ${policyCount} policies x ${config.scenarios.count} scenarios`
      );
      progressCallback?.(45);

      // Run the valuation
      // For single-threaded execution, we can't easily report intermediate progress
      // In future, we could use the worker pool for parallel execution with progress
      const engineResult: EngineValuationResult = this.engine.runValuation(valuationConfig);

      this.checkCancellation();
      progressCallback?.(100);

      // Convert engine result to extension result format
      const result: ValuationResult = {
        mean: engineResult.statistics.meanNpv,
        stdDev: engineResult.statistics.stdDev,
        percentiles: {
          p50: engineResult.statistics.percentiles.p50,
          p75: engineResult.statistics.percentiles.p75,
          p90: engineResult.statistics.percentiles.p90,
          p95: engineResult.statistics.percentiles.p95,
          p99: engineResult.statistics.percentiles.p99,
        },
        cte95: engineResult.statistics.cte95,
        executionTimeMs: engineResult.executionTimeMs,
        scenarioCount: engineResult.scenarioCount,
        distribution: engineResult.distribution,
      };

      const elapsed = Date.now() - startTime;
      logger.info(
        `Valuation completed in ${elapsed}ms (engine: ${engineResult.executionTimeMs}ms)`
      );
      logger.debug(`Mean NPV: ${result.mean.toFixed(2)}, CTE95: ${result.cte95.toFixed(2)}`);

      return result;
    } catch (error) {
      if (this.aborted) {
        throw new EngineError('Valuation cancelled by user', 'CANCELLED');
      }

      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Valuation failed: ${message}`);

      // Rethrow EngineError as-is
      if (error instanceof EngineError) {
        throw error;
      }

      throw new EngineError(`Valuation failed: ${message}`, 'VALUATION_FAILED');
    } finally {
      this.state = EngineState.Ready;
      this.currentCancellation = null;
      this.aborted = false;

      // Clear policies from memory after run to free resources
      try {
        this.engine?.clearPolicies();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Check if cancellation has been requested and throw if so
   */
  private checkCancellation(): void {
    if (this.aborted || this.currentCancellation?.isCancellationRequested) {
      this.aborted = true;
      throw new EngineError('Valuation cancelled', 'CANCELLED');
    }
  }

  /**
   * Get the number of available CPU cores for parallel execution
   */
  getWorkerCount(): number {
    const configMaxWorkers = vscode.workspace
      .getConfiguration('livecalc')
      .get<number>('maxWorkers', 0);

    // 0 means auto-detect
    if (configMaxWorkers === 0) {
      // Use number of CPUs, capped at 8 to avoid overloading
      return Math.min(os.cpus().length, 8);
    }

    return configMaxWorkers;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    logger.info('Disposing LiveCalc engine...');

    if (this.engine) {
      try {
        this.engine.dispose();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Error disposing engine: ${msg}`);
      }
      this.engine = null;
    }

    this.state = EngineState.Disposed;
    this.initPromise = null;
    LiveCalcEngineManager.instance = null;

    this._onDidDispose.fire();
    this._onDidInitialize.dispose();
    this._onDidDispose.dispose();

    logger.info('LiveCalc engine disposed');
  }
}

// Export convenience function for getting the engine manager
export function getEngineManager(): LiveCalcEngineManager {
  return LiveCalcEngineManager.getInstance();
}
