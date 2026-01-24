/**
 * CalcEngine - Abstract interface for pluggable calculation engines
 *
 * This interface enables swapping different calculation engines (LiveCalc WASM,
 * Milliman Integrate, Milliman MIND, etc.) without changing the scheduler or
 * worker pool implementation.
 *
 * Design principles:
 * - Stateless: Each runChunk call is independent
 * - Deterministic: Same inputs produce same outputs
 * - No side effects: Engine does not modify external state
 */

import type {
  ScenarioParams,
  MortalityTable,
  LapseTable,
  ExpenseAssumptions,
} from './types.js';

/**
 * Assumption data buffers passed to the engine.
 * These can be either CSV strings (for flexibility) or binary ArrayBuffers
 * (for performance with SharedArrayBuffer).
 */
export interface AssumptionBuffers {
  /**
   * Mortality table data.
   * Either a CSV string or binary ArrayBuffer (format: 242 doubles, male[0-120] then female[0-120]).
   */
  mortality: string | ArrayBuffer;

  /**
   * Lapse rates data.
   * Either a CSV string or binary ArrayBuffer (format: 50 doubles for years 1-50).
   */
  lapse: string | ArrayBuffer;

  /**
   * Expense assumptions data.
   * Either a CSV string or binary ArrayBuffer (format: 4 doubles).
   */
  expenses: string | ArrayBuffer;
}

/**
 * Configuration for running a valuation chunk.
 */
export interface ChunkConfig {
  /**
   * Number of scenarios to generate for this chunk.
   */
  numScenarios: number;

  /**
   * Random seed for scenario generation (ensures reproducibility).
   */
  seed: number;

  /**
   * Interest rate scenario generation parameters.
   */
  scenarioParams: ScenarioParams;

  /**
   * Multiplier for mortality rates (1.0 = no change).
   */
  mortalityMultiplier?: number;

  /**
   * Multiplier for lapse rates (1.0 = no change).
   */
  lapseMultiplier?: number;

  /**
   * Multiplier for expenses (1.0 = no change).
   */
  expenseMultiplier?: number;
}

/**
 * Result from running a chunk of scenarios.
 */
export interface ChunkResult {
  /**
   * Array of NPV values, one per scenario.
   */
  scenarioNpvs: Float64Array;

  /**
   * Execution time for this chunk in milliseconds.
   */
  executionTimeMs: number;
}

/**
 * Engine metadata for debugging and compatibility checks.
 */
export interface EngineInfo {
  /**
   * Name of the engine implementation.
   */
  name: string;

  /**
   * Version string (semver format).
   */
  version: string;

  /**
   * Maximum policies the engine can handle.
   */
  maxPolicies: number;

  /**
   * Maximum scenarios per chunk.
   */
  maxScenariosPerChunk: number;

  /**
   * Whether the engine supports binary data input (vs CSV only).
   */
  supportsBinaryInput: boolean;
}

/**
 * CalcEngine interface for pluggable calculation engines.
 *
 * This interface defines the contract that any calculation engine must implement
 * to be used with the LiveCalc worker pool and scheduler.
 *
 * ## Implementation Guidelines
 *
 * 1. **Stateless Design**: The engine should not maintain state between runChunk calls.
 *    All necessary data should be passed as parameters.
 *
 * 2. **Thread Safety**: Implementations will be used from multiple workers.
 *    Each worker has its own engine instance, so no shared state synchronization
 *    is needed, but the implementation must be reentrant.
 *
 * 3. **Error Handling**: Throw descriptive errors on failure. The worker pool
 *    will catch and report these errors.
 *
 * 4. **Memory Management**: Engines are responsible for their own memory.
 *    Call dispose() when done to free resources.
 *
 * ## Example Implementation
 *
 * ```typescript
 * class MyCalcEngine implements CalcEngine {
 *   private module: MyWasmModule | null = null;
 *
 *   async initialize(): Promise<void> {
 *     this.module = await loadMyWasmModule();
 *   }
 *
 *   getInfo(): EngineInfo {
 *     return {
 *       name: 'MyCalcEngine',
 *       version: '1.0.0',
 *       maxPolicies: 1_000_000,
 *       maxScenariosPerChunk: 100_000,
 *       supportsBinaryInput: true,
 *     };
 *   }
 *
 *   async loadPolicies(data: string | ArrayBuffer): Promise<number> {
 *     // Load policy data into engine
 *     return policyCount;
 *   }
 *
 *   async loadAssumptions(assumptions: AssumptionBuffers): Promise<void> {
 *     // Load assumption data into engine
 *   }
 *
 *   async runChunk(config: ChunkConfig): Promise<ChunkResult> {
 *     // Execute projection for the specified scenarios
 *     return { scenarioNpvs, executionTimeMs };
 *   }
 *
 *   dispose(): void {
 *     this.module = null;
 *   }
 * }
 * ```
 */
export interface CalcEngine {
  /**
   * Initialize the engine.
   *
   * This method is called once before any other operations. It should:
   * - Load and instantiate any WASM modules
   * - Initialize memory and resources
   * - Prepare the engine for data loading
   *
   * @throws Error if initialization fails
   */
  initialize(): Promise<void>;

  /**
   * Get engine metadata and capabilities.
   *
   * @returns Engine information including name, version, and capabilities
   */
  getInfo(): EngineInfo;

  /**
   * Load policy data into the engine.
   *
   * @param data - Policy data as CSV string or binary ArrayBuffer
   * @returns Number of policies loaded
   * @throws Error if loading fails
   */
  loadPolicies(data: string | ArrayBuffer): Promise<number>;

  /**
   * Load assumption tables into the engine.
   *
   * @param assumptions - Mortality, lapse, and expense assumptions
   * @throws Error if loading fails
   */
  loadAssumptions(assumptions: AssumptionBuffers): Promise<void>;

  /**
   * Clear loaded policies from memory.
   *
   * Call this between runs to free memory without disposing the entire engine.
   */
  clearPolicies(): void;

  /**
   * Run projection for a chunk of scenarios.
   *
   * This is the core computation method. It should:
   * 1. Generate interest rate scenarios using the provided parameters
   * 2. Project each policy under each scenario
   * 3. Calculate NPV for each scenario (sum of discounted cash flows across policies)
   * 4. Return the NPV array
   *
   * The engine should be stateless between runChunk calls - all necessary
   * configuration is passed via the ChunkConfig.
   *
   * @param config - Configuration for this chunk including scenarios and multipliers
   * @returns Array of scenario NPVs and execution time
   * @throws Error if computation fails
   */
  runChunk(config: ChunkConfig): Promise<ChunkResult>;

  /**
   * Check if the engine is initialized and ready.
   */
  readonly isInitialized: boolean;

  /**
   * Check if policies have been loaded.
   */
  readonly hasPolicies: boolean;

  /**
   * Check if assumptions have been loaded.
   */
  readonly hasAssumptions: boolean;

  /**
   * Dispose of the engine and free all resources.
   *
   * After calling dispose(), the engine must be re-initialized before use.
   */
  dispose(): void;
}

/**
 * Factory function type for creating CalcEngine instances.
 *
 * This allows the worker pool to create engine instances without knowing
 * the concrete implementation.
 */
export type CalcEngineFactory = () => CalcEngine;
