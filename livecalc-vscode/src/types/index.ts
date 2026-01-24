/**
 * LiveCalc VS Code Extension Types
 */

/**
 * Extension configuration from livecalc.config.json
 */
export interface LiveCalcConfig {
  $schema?: string;
  /** Base config to inherit from (future feature) */
  extends?: string;
  model: string;
  /** Policy data source */
  policies?: string;
  assumptions: AssumptionConfig;
  scenarios: ScenarioConfig;
  execution?: ExecutionConfig;
  output?: OutputConfig;
  /** Pipeline configuration for multi-engine execution */
  pipeline?: PipelineConfig;
}

/**
 * Pipeline configuration for chaining multiple engines together
 */
export interface PipelineConfig {
  /** Array of pipeline nodes forming a DAG */
  nodes: PipelineNode[];
  /** Debug settings for pipeline execution */
  debug?: PipelineDebugConfig;
  /** Error handling configuration */
  errorHandling?: PipelineErrorHandlingConfig;
}

/**
 * A single node in the pipeline DAG
 */
export interface PipelineNode {
  /** Unique identifier for this node */
  id: string;
  /** Engine reference (wasm://name or python://name) */
  engine: string;
  /** Input bus references (bus://category/name or $policies, $assumptions, $scenarios) */
  inputs?: string[];
  /** Output bus references (bus://category/name) */
  outputs: string[];
  /** Engine-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Debug settings for pipeline execution
 */
export interface PipelineDebugConfig {
  /** Enable CRC32 checksums on bus segments between node transitions */
  enableIntegrityChecks?: boolean;
  /** Log all bus transitions with nanosecond precision */
  enableTraceLogging?: boolean;
  /** Node IDs where pipeline should pause for inspection */
  breakpoints?: string[];
  /** Zero shared memory between runs for security */
  zeroMemoryBetweenRuns?: boolean;
}

/**
 * Error handling configuration for pipeline execution
 */
export interface PipelineErrorHandlingConfig {
  /** Continue pipeline execution after a node fails (collect partial results) */
  continueOnError?: boolean;
  /** Maximum number of errors to collect before halting (when continueOnError is true) */
  maxErrors?: number;
  /** Timeout in milliseconds for each pipeline node */
  timeoutMs?: number;
  /** Capture bus data snapshots on error for debugging */
  captureSnapshots?: boolean;
}

export interface AssumptionConfig {
  mortality: string;
  lapse: string;
  expenses: string;
}

export interface ScenarioConfig {
  count: number;
  seed: number;
  interestRate: InterestRateConfig;
}

export interface InterestRateConfig {
  initial: number;
  drift: number;
  volatility: number;
  minRate?: number;
  maxRate?: number;
}

export interface ExecutionConfig {
  autoRunOnSave?: boolean;
  timeout?: number;
  maxPolicies?: number;
}

export interface OutputConfig {
  percentiles?: number[];
  showDistribution?: boolean;
  showCashflows?: boolean;
}

/**
 * Valuation result from the WASM engine
 */
export interface ValuationResult {
  mean: number;
  stdDev: number;
  percentiles: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  cte95: number;
  executionTimeMs: number;
  scenarioCount: number;
  distribution?: number[];
}

/**
 * Policy data structure
 */
export interface Policy {
  policyId: number;
  age: number;
  gender: 'M' | 'F';
  sumAssured: number;
  premium: number;
  term: number;
  productType: string;
}

/**
 * Expense assumptions
 */
export interface ExpenseAssumptions {
  perPolicyAcquisition: number;
  perPolicyMaintenance: number;
  percentOfPremium: number;
  perClaim: number;
}

/**
 * Execution progress callback
 */
export type ProgressCallback = (percent: number) => void;

/**
 * Logger levels
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Extension state
 */
export interface ExtensionState {
  engineInitialized: boolean;
  lastRunTime?: number;
  lastRunError?: string;
  configPath?: string;
}
