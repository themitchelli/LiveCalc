/**
 * LiveCalc VS Code Extension Types
 */

/**
 * Extension configuration from livecalc.config.json
 */
export interface LiveCalcConfig {
  $schema?: string;
  model: string;
  assumptions: AssumptionConfig;
  scenarios: ScenarioConfig;
  execution?: ExecutionConfig;
  output?: OutputConfig;
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
