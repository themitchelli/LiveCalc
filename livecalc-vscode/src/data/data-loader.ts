/**
 * Data Loader for LiveCalc VS Code Extension
 *
 * Handles loading policy and assumption data from files specified in config.
 * Uses modular loaders with caching and validation.
 */

import * as path from 'path';
import { logger } from '../logging/logger';
import type { LiveCalcConfig } from '../types';
import { CsvLoadError, CsvValidationError } from './csv-loader';
import { loadPolicies, PolicyLoadResult } from './policy-loader';
import {
  loadMortality,
  loadLapse,
  loadExpenses,
  MortalityLoadResult,
  LapseLoadResult,
  ExpensesLoadResult,
} from './assumption-loader';
import { getDataCache } from './cache';
import { getDataValidator, createValidationResult } from './data-validator';

/**
 * Loaded data ready for the engine
 */
export interface LoadedData {
  policiesCsv: string;
  mortalityCsv: string;
  lapseCsv: string;
  expensesCsv: string;
}

/**
 * Extended load result with validation information
 */
export interface LoadResult extends LoadedData {
  /** Number of policies loaded */
  policyCount: number;
  /** All validation errors across files */
  errors: CsvValidationError[];
  /** All validation warnings across files */
  warnings: CsvValidationError[];
  /** Whether data is valid (no errors) */
  valid: boolean;
  /** Cache statistics */
  cacheStats: { hits: number; misses: number };
}

/**
 * Error class for data loading failures
 */
export class DataLoadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly filePath?: string
  ) {
    super(message);
    this.name = 'DataLoadError';
  }
}

/**
 * Data loading options
 */
export interface DataLoadOptions {
  /** Skip cache and force reload */
  forceReload?: boolean;
  /** Maximum policies to load */
  maxPolicies?: number;
  /** Report validation to Problems panel */
  reportValidation?: boolean;
}

/**
 * Load all data files specified in the config
 *
 * @param config - LiveCalc configuration
 * @param configDir - Directory containing the config file (for resolving relative paths)
 * @param options - Loading options
 * @returns Loaded data with validation results
 */
export async function loadData(
  config: LiveCalcConfig,
  configDir: string,
  options: DataLoadOptions = {}
): Promise<LoadResult> {
  logger.info(`Loading data from config directory: ${configDir}`);

  const cache = getDataCache();
  const validator = options.reportValidation !== false ? getDataValidator() : undefined;
  const allErrors: CsvValidationError[] = [];
  const allWarnings: CsvValidationError[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  // Clear previous validation diagnostics
  validator?.clearAll();

  // Load policies
  const policiesPath = resolveDataPath(config.policies, configDir);
  if (!policiesPath) {
    throw new DataLoadError('No policies file specified in config', 'NO_POLICIES_PATH');
  }

  let policiesResult: PolicyLoadResult;
  const cachedPolicies = !options.forceReload
    ? cache.get<PolicyLoadResult>(policiesPath)
    : undefined;

  if (cachedPolicies) {
    logger.debug(`Using cached policies: ${policiesPath}`);
    policiesResult = cachedPolicies;
    cacheHits++;
  } else {
    try {
      policiesResult = await loadPolicies(policiesPath, {
        maxPolicies: options.maxPolicies ?? config.execution?.maxPolicies,
      });
      cache.set(policiesPath, policiesResult, policiesResult.csvContent);
      cacheMisses++;
    } catch (error) {
      throw wrapError(error, 'policies', policiesPath);
    }
  }

  allErrors.push(...policiesResult.errors);
  allWarnings.push(...policiesResult.warnings);

  if (validator) {
    validator.reportValidation(
      createValidationResult(
        policiesPath,
        'policies',
        policiesResult.errors,
        policiesResult.warnings
      )
    );
  }

  // Load mortality table
  const mortalityPath = resolveDataPath(config.assumptions.mortality, configDir);
  if (!mortalityPath) {
    throw new DataLoadError('No mortality file specified in config', 'NO_MORTALITY_PATH');
  }

  let mortalityResult: MortalityLoadResult;
  const cachedMortality = !options.forceReload
    ? cache.get<MortalityLoadResult>(mortalityPath)
    : undefined;

  if (cachedMortality) {
    logger.debug(`Using cached mortality: ${mortalityPath}`);
    mortalityResult = cachedMortality;
    cacheHits++;
  } else {
    try {
      mortalityResult = await loadMortality(mortalityPath);
      cache.set(mortalityPath, mortalityResult, mortalityResult.csvContent);
      cacheMisses++;
    } catch (error) {
      throw wrapError(error, 'mortality', mortalityPath);
    }
  }

  allErrors.push(...mortalityResult.errors);
  allWarnings.push(...mortalityResult.warnings);

  if (validator) {
    validator.reportValidation(
      createValidationResult(
        mortalityPath,
        'mortality',
        mortalityResult.errors,
        mortalityResult.warnings
      )
    );
  }

  // Load lapse table
  const lapsePath = resolveDataPath(config.assumptions.lapse, configDir);
  if (!lapsePath) {
    throw new DataLoadError('No lapse file specified in config', 'NO_LAPSE_PATH');
  }

  let lapseResult: LapseLoadResult;
  const cachedLapse = !options.forceReload
    ? cache.get<LapseLoadResult>(lapsePath)
    : undefined;

  if (cachedLapse) {
    logger.debug(`Using cached lapse: ${lapsePath}`);
    lapseResult = cachedLapse;
    cacheHits++;
  } else {
    try {
      lapseResult = await loadLapse(lapsePath);
      cache.set(lapsePath, lapseResult, lapseResult.csvContent);
      cacheMisses++;
    } catch (error) {
      throw wrapError(error, 'lapse', lapsePath);
    }
  }

  allErrors.push(...lapseResult.errors);
  allWarnings.push(...lapseResult.warnings);

  if (validator) {
    validator.reportValidation(
      createValidationResult(lapsePath, 'lapse', lapseResult.errors, lapseResult.warnings)
    );
  }

  // Load expenses
  const expensesPath = resolveDataPath(config.assumptions.expenses, configDir);
  if (!expensesPath) {
    throw new DataLoadError('No expenses file specified in config', 'NO_EXPENSES_PATH');
  }

  let expensesResult: ExpensesLoadResult;
  const cachedExpenses = !options.forceReload
    ? cache.get<ExpensesLoadResult>(expensesPath)
    : undefined;

  if (cachedExpenses) {
    logger.debug(`Using cached expenses: ${expensesPath}`);
    expensesResult = cachedExpenses;
    cacheHits++;
  } else {
    try {
      expensesResult = await loadExpenses(expensesPath);
      cache.set(expensesPath, expensesResult, expensesResult.csvContent);
      cacheMisses++;
    } catch (error) {
      throw wrapError(error, 'expenses', expensesPath);
    }
  }

  allErrors.push(...expensesResult.errors);
  allWarnings.push(...expensesResult.warnings);

  if (validator) {
    validator.reportValidation(
      createValidationResult(
        expensesPath,
        'expenses',
        expensesResult.errors,
        expensesResult.warnings
      )
    );
  }

  // Log summary
  const valid = allErrors.length === 0;
  logger.info(
    `Data loading complete: ${policiesResult.count} policies, ` +
      `${allErrors.length} errors, ${allWarnings.length} warnings, ` +
      `cache hits: ${cacheHits}, misses: ${cacheMisses}`
  );

  if (!valid) {
    logger.warn(`Data validation failed with ${allErrors.length} errors`);
  }

  return {
    policiesCsv: policiesResult.csvContent,
    mortalityCsv: mortalityResult.csvContent,
    lapseCsv: lapseResult.csvContent,
    expensesCsv: expensesResult.csvContent,
    policyCount: policiesResult.count,
    errors: allErrors,
    warnings: allWarnings,
    valid,
    cacheStats: { hits: cacheHits, misses: cacheMisses },
  };
}

/**
 * Resolve a data path from config to an absolute file path
 *
 * Supports:
 * - local://path/to/file.csv - Relative to config directory
 * - Absolute paths
 * - Relative paths (relative to config directory)
 * - assumptions://name:version - Cloud assumption references (placeholder)
 */
export function resolveDataPath(
  configPath: string | undefined,
  configDir: string
): string | null {
  if (!configPath) {
    return null;
  }

  // Handle local:// prefix
  if (configPath.startsWith('local://')) {
    const relativePath = configPath.slice('local://'.length);
    return path.resolve(configDir, relativePath);
  }

  // Handle assumptions:// prefix (placeholder - not yet supported)
  if (configPath.startsWith('assumptions://')) {
    logger.warn(
      `Cloud assumption references (${configPath}) are not yet supported. ` +
        'Use local:// paths for now.'
    );
    return null;
  }

  // Handle absolute paths
  if (path.isAbsolute(configPath)) {
    return configPath;
  }

  // Treat as relative path
  return path.resolve(configDir, configPath);
}

/**
 * Wrap an error with DataLoadError for consistent error handling
 */
function wrapError(error: unknown, fileType: string, filePath: string): DataLoadError {
  if (error instanceof DataLoadError) {
    return error;
  }

  if (error instanceof CsvLoadError) {
    return new DataLoadError(error.message, error.code, error.filePath ?? filePath);
  }

  const message = error instanceof Error ? error.message : String(error);
  return new DataLoadError(
    `Failed to load ${fileType} file: ${message}`,
    'LOAD_ERROR',
    filePath
  );
}

/**
 * Invalidate cache for a specific file
 */
export function invalidateCache(filePath: string): void {
  const cache = getDataCache();
  cache.invalidate(filePath);
}

/**
 * Invalidate all cached data
 */
export function invalidateAllCache(): void {
  const cache = getDataCache();
  cache.invalidateAll();
}

/**
 * Get current cache statistics
 */
export function getCacheStats(): { entries: number; watchedFiles: number } {
  const cache = getDataCache();
  return cache.getStats();
}

// ============================================================================
// Sample Data Generators (for testing)
// ============================================================================

/**
 * Generate sample policies CSV for testing
 */
export function generateSamplePoliciesCsv(count: number = 100): string {
  const header = 'policy_id,age,gender,sum_assured,premium,term,product_type';
  const rows: string[] = [header];

  for (let i = 1; i <= count; i++) {
    const age = 25 + (i % 40); // Ages 25-64
    const gender = i % 2 === 0 ? 'M' : 'F';
    const sumAssured = 100000 + (i % 10) * 50000;
    const premium = sumAssured * 0.012;
    const term = 10 + (i % 3) * 5; // Terms: 10, 15, 20
    rows.push(`${i},${age},${gender},${sumAssured},${premium.toFixed(2)},${term},TERM`);
  }

  return rows.join('\n');
}

/**
 * Generate sample mortality CSV for testing
 */
export function generateSampleMortalityCsv(): string {
  const header = 'age,male,female';
  const rows: string[] = [header];

  // Simplified mortality rates - actual tables would be more detailed
  for (let age = 0; age <= 120; age++) {
    // Simple Gompertz-like mortality: qx = A * exp(B * age)
    const maleQx = Math.min(0.00025 * Math.exp(0.08 * age), 1.0);
    const femaleQx = Math.min(0.0002 * Math.exp(0.08 * age), 1.0);
    rows.push(`${age},${maleQx.toFixed(8)},${femaleQx.toFixed(8)}`);
  }

  return rows.join('\n');
}

/**
 * Generate sample lapse CSV for testing
 */
export function generateSampleLapseCsv(): string {
  const header = 'year,rate';
  const rows: string[] = [header];

  // Typical lapse pattern: high in early years, declining over time
  const lapseRates = [
    0.1, 0.08, 0.06, 0.05, 0.04, // Years 1-5
    0.035, 0.03, 0.028, 0.025, 0.022, // Years 6-10
    0.02, 0.02, 0.02, 0.02, 0.02, // Years 11-15
    0.015, 0.015, 0.015, 0.015, 0.015, // Years 16-20
  ];

  // Extend to 50 years with constant rate
  for (let year = 1; year <= 50; year++) {
    const rate = year <= lapseRates.length ? lapseRates[year - 1] : 0.01;
    rows.push(`${year},${rate.toFixed(4)}`);
  }

  return rows.join('\n');
}

/**
 * Generate sample expenses CSV for testing
 */
export function generateSampleExpensesCsv(): string {
  return `parameter,value
per_policy_acquisition,500
per_policy_maintenance,50
percent_of_premium,0.02
claim_expense,100`;
}

// Re-export types and classes from modular loaders
export { CsvLoadError, CsvValidationError } from './csv-loader';
export type { PolicyLoadResult } from './policy-loader';
export type { MortalityLoadResult, LapseLoadResult, ExpensesLoadResult } from './assumption-loader';
