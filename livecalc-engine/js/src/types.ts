/**
 * LiveCalc Engine TypeScript Type Definitions
 */

/**
 * Gender enumeration matching C++ engine
 */
export type Gender = 'M' | 'F';

/**
 * Product type enumeration matching C++ engine
 */
export type ProductType = 'TERM' | 'WHOLE_LIFE' | 'ENDOWMENT';

/**
 * Policy data structure
 */
export interface Policy {
  /** Unique policy identifier */
  policyId: number;
  /** Issue age of policyholder */
  age: number;
  /** Gender of policyholder */
  gender: Gender;
  /** Sum assured / death benefit */
  sumAssured: number;
  /** Annual premium */
  premium: number;
  /** Policy term in years */
  term: number;
  /** Product type */
  productType: ProductType;
}

/**
 * Mortality table structure - qx rates by age and gender
 * Array indexed by age (0-120), each entry has male and female rates
 */
export interface MortalityTable {
  /** qx rates for males, indexed by age (0-120) */
  male: number[];
  /** qx rates for females, indexed by age (0-120) */
  female: number[];
}

/**
 * Lapse table structure - lapse rates by policy year
 * Array indexed by policy year (1-50)
 */
export type LapseTable = number[];

/**
 * Expense assumptions structure
 */
export interface ExpenseAssumptions {
  /** Per-policy acquisition expense (year 1 only) */
  perPolicyAcquisition: number;
  /** Per-policy maintenance expense (each year) */
  perPolicyMaintenance: number;
  /** Percent of premium expense */
  percentOfPremium: number;
  /** Claim expense per death */
  claimExpense: number;
}

/**
 * Scenario generation parameters for GBM model
 */
export interface ScenarioParams {
  /** Initial interest rate (e.g., 0.04 for 4%) */
  initialRate: number;
  /** Annual drift parameter */
  drift: number;
  /** Annual volatility parameter */
  volatility: number;
  /** Minimum interest rate floor */
  minRate: number;
  /** Maximum interest rate ceiling */
  maxRate: number;
}

/**
 * Valuation configuration options
 */
export interface ValuationConfig {
  /** Number of scenarios to generate */
  numScenarios: number;
  /** Random seed for reproducibility */
  seed: number;
  /** Scenario generation parameters */
  scenarioParams: ScenarioParams;
  /** Mortality rate multiplier (1.0 = no change) */
  mortalityMultiplier?: number;
  /** Lapse rate multiplier (1.0 = no change) */
  lapseMultiplier?: number;
  /** Expense multiplier (1.0 = no change) */
  expenseMultiplier?: number;
  /** Whether to store individual scenario NPVs for distribution analysis */
  storeDistribution?: boolean;
}

/**
 * Valuation result percentiles
 */
export interface Percentiles {
  /** Median (50th percentile) */
  p50: number;
  /** 75th percentile */
  p75: number;
  /** 90th percentile */
  p90: number;
  /** 95th percentile */
  p95: number;
  /** 99th percentile */
  p99: number;
}

/**
 * Valuation result statistics
 */
export interface ValuationStatistics {
  /** Mean NPV across all scenarios */
  meanNpv: number;
  /** Standard deviation of scenario NPVs */
  stdDev: number;
  /** Percentile values */
  percentiles: Percentiles;
  /** Conditional Tail Expectation at 95% (average of worst 5%) */
  cte95: number;
}

/**
 * Complete valuation result
 */
export interface ValuationResult {
  /** Summary statistics */
  statistics: ValuationStatistics;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Number of scenarios used */
  scenarioCount: number;
  /** Individual scenario NPVs (only if storeDistribution was true) */
  distribution?: number[];
}

/**
 * Default scenario parameters (typical economic assumptions)
 */
export const DEFAULT_SCENARIO_PARAMS: ScenarioParams = {
  initialRate: 0.04,
  drift: 0.0,
  volatility: 0.02,
  minRate: 0.0,
  maxRate: 0.15,
};

/**
 * LiveCalc WASM Module interface
 * This represents the Emscripten-generated module
 */
export interface LiveCalcWasmModule {
  // Memory management
  _livecalc_malloc(size: number): number;
  _livecalc_free(ptr: number): void;

  // Policy loading
  _load_policies_csv(dataPtr: number, size: number): number;
  _load_policies_binary(dataPtr: number, size: number): number;
  _get_policy_count(): number;
  _clear_policies(): void;

  // Assumption loading
  _load_mortality_csv(dataPtr: number, size: number): number;
  _load_mortality_binary(dataPtr: number, size: number): number;
  _load_lapse_csv(dataPtr: number, size: number): number;
  _load_lapse_binary(dataPtr: number, size: number): number;
  _load_expenses_csv(dataPtr: number, size: number): number;
  _load_expenses_binary(dataPtr: number, size: number): number;

  // Valuation execution
  _run_valuation(
    numScenarios: number,
    seed: bigint,
    initialRate: number,
    drift: number,
    volatility: number,
    minRate: number,
    maxRate: number,
    mortalityMult: number,
    lapseMult: number,
    expenseMult: number,
    storeDistribution: number
  ): number;

  // Result accessors
  _get_result_mean(): number;
  _get_result_std_dev(): number;
  _get_result_p50(): number;
  _get_result_p75(): number;
  _get_result_p90(): number;
  _get_result_p95(): number;
  _get_result_p99(): number;
  _get_result_cte95(): number;
  _get_result_execution_time_ms(): number;
  _get_result_scenario_count(): number;
  _get_result_scenario_npv(index: number): number;
  _get_result_distribution(bufferPtr: number, bufferSize: number): number;

  // JSON output
  _generate_result_json(): number;
  _get_result_json_ptr(): number;
  _get_result_json_length(): number;

  // Version
  _get_version(): number;

  // Emscripten runtime methods
  UTF8ToString(ptr: number, maxLen?: number): string;
  stringToUTF8(str: string, ptr: number, maxLen: number): void;
  lengthBytesUTF8(str: string): number;
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, value: number, type: string): void;

  // HEAP access for reading memory directly (may be undefined in some builds)
  HEAPU8?: Uint8Array;
  HEAPF64?: Float64Array;

  // WASM memory for direct buffer access (available in modularized builds)
  wasmMemory?: WebAssembly.Memory;
}

/**
 * Factory function type for creating WASM module
 */
export type CreateLiveCalcModule = () => Promise<LiveCalcWasmModule>;

/**
 * Error codes returned by WASM functions
 */
export enum LiveCalcError {
  SUCCESS = 0,
  ERROR = -1,
}

// ==========================================================================
// Worker Message Protocol
// ==========================================================================

/**
 * Message from main thread to worker: Initialize WASM
 */
export interface WorkerInitMessage {
  type: 'init';
  /** Path to the WASM module (.mjs file) */
  wasmPath: string;
  /** Worker identifier */
  workerId: number;
}

/**
 * Message from main thread to worker: Load data
 */
export interface WorkerLoadDataMessage {
  type: 'load-data';
  policiesCsv: string;
  mortalityCsv: string;
  lapseCsv: string;
  expensesCsv: string;
}

/**
 * Message from main thread to worker: Run valuation
 */
export interface WorkerRunValuationMessage {
  type: 'run-valuation';
  numScenarios: number;
  seed: number;
  scenarioParams: ScenarioParams;
  mortalityMultiplier: number;
  lapseMultiplier: number;
  expenseMultiplier: number;
  storeDistribution: boolean;
}

/**
 * Message from main thread to worker: Attach SharedArrayBuffer
 */
export interface WorkerAttachSabMessage {
  type: 'attach-sab';
  /** The SharedArrayBuffer containing all data */
  buffer: SharedArrayBuffer;
  /** Worker identifier */
  workerId: number;
  /** Maximum scenarios this worker can store */
  maxScenariosPerWorker: number;
}

/**
 * Message from main thread to worker: Run valuation using SharedArrayBuffer data
 */
export interface WorkerRunValuationSabMessage {
  type: 'run-valuation-sab';
  numScenarios: number;
  seed: number;
  scenarioParams: ScenarioParams;
  mortalityMultiplier: number;
  lapseMultiplier: number;
  expenseMultiplier: number;
  /** This worker's ID (for writing results to correct offset) */
  workerId: number;
}

/**
 * Union of all worker input messages
 */
export type WorkerMessage =
  | WorkerInitMessage
  | WorkerLoadDataMessage
  | WorkerRunValuationMessage
  | WorkerAttachSabMessage
  | WorkerRunValuationSabMessage;

/**
 * Response from worker: Initialization complete
 */
export interface WorkerInitCompleteResponse {
  type: 'init-complete';
}

/**
 * Response from worker: Data loading complete
 */
export interface WorkerLoadCompleteResponse {
  type: 'load-complete';
}

/**
 * Response from worker: Progress update
 */
export interface WorkerProgressResponse {
  type: 'progress';
  /** Progress percentage (0-100) */
  percent: number;
}

/**
 * Response from worker: Valuation result
 */
export interface WorkerResultResponse {
  type: 'result';
  /** Individual scenario NPVs for this worker's chunk */
  scenarioNpvs: number[];
  /** Execution time for this worker in milliseconds */
  executionTimeMs: number;
}

/**
 * Response from worker: SharedArrayBuffer attached successfully
 */
export interface WorkerSabAttachedResponse {
  type: 'sab-attached';
}

/**
 * Response from worker: Valuation complete (results in SharedArrayBuffer)
 */
export interface WorkerResultSabResponse {
  type: 'result-sab';
  /** Number of scenarios computed (results are in shared buffer) */
  scenarioCount: number;
  /** Execution time for this worker in milliseconds */
  executionTimeMs: number;
}

/**
 * Response from worker: Error
 */
export interface WorkerErrorResponse {
  type: 'error';
  /** Error message */
  message: string;
}

/**
 * Union of all worker output messages
 */
export type WorkerResponse =
  | WorkerInitCompleteResponse
  | WorkerLoadCompleteResponse
  | WorkerProgressResponse
  | WorkerResultResponse
  | WorkerErrorResponse
  | WorkerSabAttachedResponse
  | WorkerResultSabResponse;

/**
 * Callback for progress updates during parallel valuation
 */
export type WorkerProgressCallback = (percent: number) => void;

// ==========================================================================
// Memory Configuration (Server Environments)
// ==========================================================================

/**
 * Memory configuration options for server environments.
 *
 * These settings allow fine-tuning memory usage for different deployment scenarios:
 * - Development: Lower limits for faster iteration
 * - Production: Higher limits for large-scale valuations
 * - Cloud: Align with container memory limits
 */
export interface MemoryConfig {
  /**
   * Initial memory allocation in bytes (default: 64MB).
   * Higher values reduce memory growth operations but increase startup memory.
   */
  initialMemory?: number;

  /**
   * Maximum memory limit in bytes (default: 4GB).
   * Set this to match container memory limits in cloud deployments.
   * WASM will fail gracefully if this limit is exceeded.
   */
  maxMemory?: number;

  /**
   * Maximum number of policies to allow (default: 1,000,000).
   * Provides early validation to prevent out-of-memory errors.
   * Each policy uses ~32 bytes in-memory.
   */
  maxPolicies?: number;

  /**
   * Maximum number of scenarios to allow (default: 100,000).
   * Provides early validation to prevent out-of-memory errors.
   * Each scenario uses ~400 bytes.
   */
  maxScenarios?: number;
}

/**
 * Default memory configuration for development environments.
 */
export const DEFAULT_MEMORY_CONFIG: Required<MemoryConfig> = {
  initialMemory: 64 * 1024 * 1024,    // 64 MB
  maxMemory: 4 * 1024 * 1024 * 1024,  // 4 GB
  maxPolicies: 1_000_000,
  maxScenarios: 100_000,
};

/**
 * Memory configuration preset for constrained environments (e.g., small containers).
 */
export const MEMORY_CONFIG_SMALL: Required<MemoryConfig> = {
  initialMemory: 32 * 1024 * 1024,    // 32 MB
  maxMemory: 512 * 1024 * 1024,       // 512 MB
  maxPolicies: 100_000,
  maxScenarios: 10_000,
};

/**
 * Memory configuration preset for large-scale server deployments.
 */
export const MEMORY_CONFIG_LARGE: Required<MemoryConfig> = {
  initialMemory: 256 * 1024 * 1024,   // 256 MB
  maxMemory: 8 * 1024 * 1024 * 1024,  // 8 GB (requires 64-bit WASM)
  maxPolicies: 10_000_000,
  maxScenarios: 1_000_000,
};
