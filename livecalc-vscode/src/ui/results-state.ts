import { LiveCalcConfig, ValuationResult } from '../types';

/**
 * Generate a simple UUID v4
 */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Statistics data for display
 */
export interface StatisticsData {
  mean: number;
  stdDev: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  cte95: number;
  min: number;
  max: number;
}

/**
 * Run metadata for display
 */
export interface RunMetadata {
  runId: string;
  timestamp: Date;
  modelFile: string;
  policyFile?: string;
  policyCount: number;
  scenarioCount: number;
  seed: number;
  executionMode: 'local' | 'cloud';
  jobId?: string;
  cost?: number;
}

/**
 * Assumption info for display
 */
export interface AssumptionInfo {
  name: string;
  type: 'mortality' | 'lapse' | 'expenses';
  source: string;
  isLocal: boolean;
  multiplier?: number;
  hash?: string;
  modified?: boolean;
}

/**
 * Complete results state for display
 */
export interface ResultsState {
  statistics: StatisticsData;
  distribution: number[];
  metadata: RunMetadata;
  assumptions: AssumptionInfo[];
  executionTimeMs: number;
  warnings?: string[];
}

/**
 * Panel state union type
 */
export type PanelState =
  | { type: 'empty' }
  | { type: 'loading'; message?: string }
  | { type: 'error'; error: string; details?: string }
  | { type: 'results'; results: ResultsState };

/**
 * Comparison delta for a statistic
 */
export interface StatisticDelta {
  absolute: number;
  percentage: number;
  direction: 'positive' | 'negative' | 'neutral';
}

/**
 * Comparison state between two runs
 */
export interface ComparisonState {
  baseline: ResultsState;
  deltas: {
    mean: StatisticDelta;
    stdDev: StatisticDelta;
    p50: StatisticDelta;
    p75: StatisticDelta;
    p90: StatisticDelta;
    p95: StatisticDelta;
    p99: StatisticDelta;
    cte95: StatisticDelta;
  };
}

/**
 * Create ResultsState from valuation result and config
 */
export function createResultsState(
  result: ValuationResult,
  config: LiveCalcConfig,
  configDir: string,
  policyCount: number
): ResultsState {
  const distribution = result.distribution || [];

  // Calculate min/max from distribution
  const min = distribution.length > 0 ? Math.min(...distribution) : 0;
  const max = distribution.length > 0 ? Math.max(...distribution) : 0;

  const statistics: StatisticsData = {
    mean: result.mean,
    stdDev: result.stdDev,
    p50: result.percentiles.p50,
    p75: result.percentiles.p75,
    p90: result.percentiles.p90,
    p95: result.percentiles.p95,
    p99: result.percentiles.p99,
    cte95: result.cte95,
    min,
    max,
  };

  const metadata: RunMetadata = {
    runId: generateUuid(),
    timestamp: new Date(),
    modelFile: config.model,
    policyFile: config.policies,
    policyCount,
    scenarioCount: result.scenarioCount,
    seed: config.scenarios.seed,
    executionMode: 'local',
  };

  const assumptions: AssumptionInfo[] = [
    {
      name: 'Mortality',
      type: 'mortality',
      source: config.assumptions.mortality,
      isLocal: isLocalPath(config.assumptions.mortality),
    },
    {
      name: 'Lapse',
      type: 'lapse',
      source: config.assumptions.lapse,
      isLocal: isLocalPath(config.assumptions.lapse),
    },
    {
      name: 'Expenses',
      type: 'expenses',
      source: config.assumptions.expenses,
      isLocal: isLocalPath(config.assumptions.expenses),
    },
  ];

  return {
    statistics,
    distribution,
    metadata,
    assumptions,
    executionTimeMs: result.executionTimeMs,
  };
}

/**
 * Check if path is a local file reference
 */
function isLocalPath(path: string): boolean {
  return path.startsWith('local://') || (!path.startsWith('assumptions://') && !path.includes('://'));
}

/**
 * Calculate comparison deltas between two results
 */
export function calculateComparison(current: ResultsState, baseline: ResultsState): ComparisonState {
  const calculateDelta = (currentValue: number, baselineValue: number): StatisticDelta => {
    const absolute = currentValue - baselineValue;
    const percentage = baselineValue !== 0 ? (absolute / Math.abs(baselineValue)) * 100 : 0;

    let direction: 'positive' | 'negative' | 'neutral';
    if (Math.abs(percentage) < 0.1) {
      direction = 'neutral';
    } else if (absolute > 0) {
      direction = 'positive';
    } else {
      direction = 'negative';
    }

    return { absolute, percentage, direction };
  };

  return {
    baseline,
    deltas: {
      mean: calculateDelta(current.statistics.mean, baseline.statistics.mean),
      stdDev: calculateDelta(current.statistics.stdDev, baseline.statistics.stdDev),
      p50: calculateDelta(current.statistics.p50, baseline.statistics.p50),
      p75: calculateDelta(current.statistics.p75, baseline.statistics.p75),
      p90: calculateDelta(current.statistics.p90, baseline.statistics.p90),
      p95: calculateDelta(current.statistics.p95, baseline.statistics.p95),
      p99: calculateDelta(current.statistics.p99, baseline.statistics.p99),
      cte95: calculateDelta(current.statistics.cte95, baseline.statistics.cte95),
    },
  };
}

/**
 * Format a number as currency (GBP by default)
 */
export function formatCurrency(value: number, options?: {
  currency?: string;
  abbreviate?: boolean;
  decimals?: number;
}): string {
  const currency = options?.currency ?? 'GBP';
  const abbreviate = options?.abbreviate ?? true;
  const decimals = options?.decimals ?? 0;

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  let formatted: string;
  let suffix = '';

  if (abbreviate && absValue >= 1_000_000_000) {
    formatted = (absValue / 1_000_000_000).toFixed(decimals === 0 ? 2 : decimals);
    suffix = 'B';
  } else if (abbreviate && absValue >= 1_000_000) {
    formatted = (absValue / 1_000_000).toFixed(decimals === 0 ? 2 : decimals);
    suffix = 'M';
  } else if (abbreviate && absValue >= 1_000) {
    formatted = (absValue / 1_000).toFixed(decimals === 0 ? 1 : decimals);
    suffix = 'K';
  } else {
    formatted = absValue.toFixed(decimals);
  }

  // Add thousands separator
  const parts = formatted.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  formatted = parts.join('.');

  const currencySymbol = currency === 'GBP' ? '\u00A3' : currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : '';

  return `${sign}${currencySymbol}${formatted}${suffix}`;
}

/**
 * Format a delta value for display
 */
export function formatDelta(delta: StatisticDelta): string {
  const sign = delta.absolute >= 0 ? '+' : '';
  const formatted = formatCurrency(delta.absolute);
  const percent = delta.percentage.toFixed(1);
  return `${sign}${formatted} (${sign}${percent}%)`;
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}
