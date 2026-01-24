/**
 * Data Loader for LiveCalc VS Code Extension
 *
 * Handles loading policy and assumption data from files specified in config.
 * Uses modular loaders with caching and validation.
 * Supports both local file references and Assumptions Manager (AM) references.
 */

import * as vscode from 'vscode';
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
  expensesToCsv,
} from './assumption-loader';
import { getDataCache } from './cache';
import { getDataValidator, createValidationResult } from './data-validator';
import {
  getCacheManager,
  ReloadStrategy,
  ChangeAnalysis,
  DataFileType,
} from '../auto-run/cache-manager';
import {
  AssumptionResolver,
  ResolutionError,
  AuthManager,
  AssumptionsManagerClient,
  AMCache,
  type ResolvedAssumption,
  type FullResolutionResult,
  type AMVersionInfo,
} from '../assumptions-manager';

/**
 * Assumption metadata for display
 * Extended to support both local files and Assumptions Manager references
 */
export interface AssumptionMetadata {
  /** File path for local, reference string for AM */
  filePath: string;
  /** Content hash for reproducibility */
  contentHash: string;
  /** File modification time (for local files) */
  modTime?: string;
  /** Source: 'local' or 'am' */
  source?: 'local' | 'am';
  /** AM table name (for AM references) */
  tableName?: string;
  /** Version requested (e.g., 'latest', 'v2.1') */
  version?: string;
  /** Resolved version (actual version number) */
  resolvedVersion?: string;
  /** Approval status (for AM references) */
  approvalStatus?: AMVersionInfo['status'];
  /** Approved by (for AM references) */
  approvedBy?: string;
  /** Approved at (for AM references) */
  approvedAt?: string;
}

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
  /** Assumption file metadata for display */
  assumptionMeta: {
    mortality: AssumptionMetadata;
    lapse: AssumptionMetadata;
    expenses: AssumptionMetadata;
  };
  /** Smart reload analysis (if smartReload was used) */
  reloadAnalysis?: ChangeAnalysis;
  /** Resolved versions for AM references (for audit trail) */
  resolvedVersions?: Map<string, string>;
  /** Resolution log messages */
  resolutionLog?: string[];
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
  /** Changed files for smart reload optimization */
  changedFiles?: string[];
  /** Use smart reload optimization (respects livecalc.enableCaching setting) */
  smartReload?: boolean;
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
  // Check if any assumptions use AM references
  if (hasAMReferences(config)) {
    logger.info('Config contains Assumptions Manager references, using AM resolver');
    return loadDataWithAMResolver(config, configDir, options);
  }

  // Check if smart reload is enabled and requested
  const enableCaching = vscode.workspace.getConfiguration('livecalc').get('enableCaching', true);
  const useSmartReload = options.smartReload && enableCaching && options.changedFiles;

  if (useSmartReload && options.changedFiles && options.changedFiles.length > 0) {
    return loadDataSmart(config, configDir, options.changedFiles, options);
  }

  // Use standard loading
  return loadDataStandard(config, configDir, options);
}

/**
 * Load data with Assumptions Manager resolver for AM references
 *
 * This function handles mixed scenarios where some assumptions come from
 * Assumptions Manager and others from local files.
 */
async function loadDataWithAMResolver(
  config: LiveCalcConfig,
  configDir: string,
  options: DataLoadOptions
): Promise<LoadResult> {
  logger.info('Loading data with AM resolver');

  const cache = getDataCache();
  const validator = options.reportValidation !== false ? getDataValidator() : undefined;
  const allErrors: CsvValidationError[] = [];
  const allWarnings: CsvValidationError[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  // Clear previous validation diagnostics
  validator?.clearAll();

  // Load policies (always local)
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

  // Get the resolver (requires AuthManager and Client from the extension)
  if (!AuthManager.hasInstance()) {
    throw new DataLoadError(
      'AuthManager not initialized. Extension may not be fully activated.',
      'AUTH_NOT_INITIALIZED'
    );
  }
  const authManager = AuthManager.getInstance();

  const client = AssumptionsManagerClient.getInstance(authManager);

  // Get AMCache instance if available (for caching version-specific assumptions)
  // AMCache is initialized by the extension - get existing instance if it exists
  const amCache = AMCache.getExistingInstance();

  const resolver = AssumptionResolver.getInstance(authManager, client, amCache);

  // Resolve all assumptions (handles both AM and local references)
  let resolutionResult: FullResolutionResult;
  try {
    resolutionResult = await resolver.resolveAll(config, configDir);
  } catch (error) {
    if (error instanceof ResolutionError) {
      throw new DataLoadError(
        error.message,
        'RESOLUTION_ERROR',
        error.reference
      );
    }
    throw error;
  }

  // Add resolution warnings
  for (const warning of resolutionResult.warnings) {
    allWarnings.push({
      message: warning,
      severity: 'warning',
    });
  }

  // Convert resolved assumptions to CSV format for the engine
  const mortalityCsv = convertResolvedToCsv(
    resolutionResult.assumptions.mortality,
    'mortality'
  );
  const lapseCsv = convertResolvedToCsv(
    resolutionResult.assumptions.lapse,
    'lapse'
  );
  const expensesCsv = convertResolvedToCsv(
    resolutionResult.assumptions.expenses,
    'expenses'
  );

  // Build assumption metadata
  const assumptionMeta = {
    mortality: buildAssumptionMetadata(resolutionResult.assumptions.mortality),
    lapse: buildAssumptionMetadata(resolutionResult.assumptions.lapse),
    expenses: buildAssumptionMetadata(resolutionResult.assumptions.expenses),
  };

  // Log summary
  const valid = allErrors.length === 0;
  logger.info(
    `Data loading complete (with AM resolver): ${policiesResult.count} policies, ` +
      `${allErrors.length} errors, ${allWarnings.length} warnings`
  );

  // Log resolution details
  for (const log of resolutionResult.resolutionLog) {
    logger.info(`Resolution: ${log}`);
  }

  if (!valid) {
    logger.warn(`Data validation failed with ${allErrors.length} errors`);
  }

  return {
    policiesCsv: policiesResult.csvContent,
    mortalityCsv,
    lapseCsv,
    expensesCsv,
    policyCount: policiesResult.count,
    errors: allErrors,
    warnings: allWarnings,
    valid,
    cacheStats: { hits: cacheHits, misses: cacheMisses },
    assumptionMeta,
    resolvedVersions: resolutionResult.resolvedVersions,
    resolutionLog: resolutionResult.resolutionLog,
  };
}

/**
 * Convert a resolved assumption to CSV format for the engine
 */
function convertResolvedToCsv(
  resolved: ResolvedAssumption,
  assumptionType: 'mortality' | 'lapse' | 'expenses'
): string {
  // Build CSV from columns and data
  const header = resolved.columns.join(',');
  const rows = resolved.data.map((row) => row.join(','));

  // For expenses, we need special handling since the engine expects a specific format
  if (assumptionType === 'expenses') {
    // If it's from AM, convert the tabular format to the expected parameter,value format
    if (resolved.source === 'am') {
      return convertExpenseDataToCsv(resolved);
    }
    // For local files, the data is already in the right format
    return [header, ...rows].join('\n');
  }

  return [header, ...rows].join('\n');
}

/**
 * Convert expense data from AM format to engine CSV format
 */
function convertExpenseDataToCsv(resolved: ResolvedAssumption): string {
  // Expected engine format:
  // parameter,value
  // per_policy_acquisition,500
  // per_policy_maintenance,50
  // percent_of_premium,0.02
  // claim_expense,100

  // AM format could be:
  // - columns: ['name', 'value'] with rows [['acquisition', 500], ...]
  // - or columns: ['per_policy_acquisition', 'per_policy_maintenance', ...]

  const columns = resolved.columns.map((c) => c.toLowerCase());

  // Check if it's name/value format
  const nameIdx = columns.findIndex((c) => ['name', 'parameter', 'type'].includes(c));
  const valueIdx = columns.findIndex((c) => ['value', 'amount', 'rate'].includes(c));

  if (nameIdx >= 0 && valueIdx >= 0) {
    // Name/value format - convert to expected parameter names
    const params: Record<string, number> = {};
    for (const row of resolved.data) {
      const name = String(resolved.columns[nameIdx] === 'name' ? '' : '') || 'unknown';
      // Actually extract name from the first column data
      const rowName = String(row[nameIdx]).toLowerCase().replace(/[\s-]/g, '_');
      params[rowName] = row[valueIdx];
    }

    return `parameter,value
per_policy_acquisition,${params['per_policy_acquisition'] ?? params['acquisition'] ?? 0}
per_policy_maintenance,${params['per_policy_maintenance'] ?? params['maintenance'] ?? 0}
percent_of_premium,${params['percent_of_premium'] ?? params['percent_premium'] ?? 0}
claim_expense,${params['claim_expense'] ?? params['per_claim'] ?? 0}`;
  }

  // Columnar format - look for specific column names
  const acqIdx = columns.findIndex((c) =>
    ['per_policy_acquisition', 'acquisition', 'acq_expense'].includes(c)
  );
  const maintIdx = columns.findIndex((c) =>
    ['per_policy_maintenance', 'maintenance', 'maint_expense'].includes(c)
  );
  const pctIdx = columns.findIndex((c) =>
    ['percent_of_premium', 'percent_premium', 'pct_premium'].includes(c)
  );
  const claimIdx = columns.findIndex((c) =>
    ['claim_expense', 'per_claim', 'claim'].includes(c)
  );

  // Use first row if columnar format
  const row = resolved.data[0] || [];

  return `parameter,value
per_policy_acquisition,${acqIdx >= 0 ? row[acqIdx] : 0}
per_policy_maintenance,${maintIdx >= 0 ? row[maintIdx] : 0}
percent_of_premium,${pctIdx >= 0 ? row[pctIdx] : 0}
claim_expense,${claimIdx >= 0 ? row[claimIdx] : 0}`;
}

/**
 * Build AssumptionMetadata from a resolved assumption
 */
function buildAssumptionMetadata(resolved: ResolvedAssumption): AssumptionMetadata {
  return {
    filePath: resolved.source === 'local' ? resolved.reference : `assumptions://${resolved.tableName}:${resolved.version}`,
    contentHash: resolved.metadata.contentHash,
    modTime: resolved.metadata.fetchedAt,
    source: resolved.source,
    tableName: resolved.source === 'am' ? resolved.tableName : undefined,
    version: resolved.source === 'am' ? resolved.version : undefined,
    resolvedVersion: resolved.source === 'am' ? resolved.resolvedVersion : undefined,
    approvalStatus: resolved.metadata.status,
    approvedBy: resolved.metadata.approvedBy,
    approvedAt: resolved.metadata.approvedAt,
  };
}

/**
 * Check if a path is an Assumptions Manager reference
 */
export function isAMReference(configPath: string | undefined): boolean {
  return configPath?.startsWith('assumptions://') ?? false;
}

/**
 * Check if a config has any Assumptions Manager references
 */
export function hasAMReferences(config: LiveCalcConfig): boolean {
  return (
    isAMReference(config.assumptions.mortality) ||
    isAMReference(config.assumptions.lapse) ||
    isAMReference(config.assumptions.expenses)
  );
}

/**
 * Resolve a data path from config to an absolute file path
 *
 * Supports:
 * - local://path/to/file.csv - Relative to config directory
 * - Absolute paths
 * - Relative paths (relative to config directory)
 * - assumptions://name:version - Cloud assumption references (handled by resolver)
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

  // Handle assumptions:// prefix - return null to signal AM resolution needed
  if (configPath.startsWith('assumptions://')) {
    // This is now handled by AssumptionResolver
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
// Smart Reload Optimization
// ============================================================================

/**
 * Load data with smart reload optimization
 *
 * Analyzes which files changed and only reloads the necessary data,
 * keeping unchanged data cached.
 *
 * @param config - LiveCalc configuration
 * @param configDir - Directory containing the config file
 * @param changedFiles - List of file paths that changed
 * @param options - Loading options
 * @returns Loaded data with reload analysis
 */
async function loadDataSmart(
  config: LiveCalcConfig,
  configDir: string,
  changedFiles: string[],
  options: DataLoadOptions
): Promise<LoadResult> {
  const cacheManager = getCacheManager();
  cacheManager.updateConfig(config, configDir);

  // Analyze what changed
  const analysis = cacheManager.analyzeChanges(changedFiles);

  logger.info(
    `Smart reload: ${analysis.strategy} - ${analysis.reason} ` +
      `(changed: ${analysis.changedFiles.join(', ') || 'none'})`
  );

  // If full reload is needed, use normal load
  if (analysis.strategy === ReloadStrategy.FULL) {
    logger.debug('Smart reload: Full reload required, using standard load');
    const result = await loadDataWithAnalysis(config, configDir, options, true);
    result.reloadAnalysis = analysis;
    return result;
  }

  // If nothing changed, try to use fully cached data
  if (analysis.strategy === ReloadStrategy.NONE) {
    logger.debug('Smart reload: No relevant changes, using cached data');
  }

  // Selective reload based on analysis
  const result = await loadDataSelective(config, configDir, options, analysis);
  result.reloadAnalysis = analysis;
  return result;
}

/**
 * Load data selectively based on change analysis
 */
async function loadDataSelective(
  config: LiveCalcConfig,
  configDir: string,
  options: DataLoadOptions,
  analysis: ChangeAnalysis
): Promise<LoadResult> {
  const cache = getDataCache();
  const cacheManager = getCacheManager();
  const validator = options.reportValidation !== false ? getDataValidator() : undefined;
  const allErrors: CsvValidationError[] = [];
  const allWarnings: CsvValidationError[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  // Clear previous validation diagnostics
  validator?.clearAll();

  // Determine what to reload based on strategy
  const reloadPolicies = cacheManager.shouldReload('policies', analysis.strategy, analysis.changedTypes);
  const reloadMortality = cacheManager.shouldReload('mortality', analysis.strategy, analysis.changedTypes);
  const reloadLapse = cacheManager.shouldReload('lapse', analysis.strategy, analysis.changedTypes);
  const reloadExpenses = cacheManager.shouldReload('expenses', analysis.strategy, analysis.changedTypes);

  logger.debug(
    `Smart reload decisions: policies=${reloadPolicies}, ` +
      `mortality=${reloadMortality}, lapse=${reloadLapse}, expenses=${reloadExpenses}`
  );

  // Load policies
  const policiesPath = resolveDataPath(config.policies, configDir);
  if (!policiesPath) {
    throw new DataLoadError('No policies file specified in config', 'NO_POLICIES_PATH');
  }

  let policiesResult: PolicyLoadResult;
  const cachedPolicies = !reloadPolicies ? cache.get<PolicyLoadResult>(policiesPath) : undefined;

  if (cachedPolicies) {
    logger.debug(`Smart reload: Using cached policies`);
    policiesResult = cachedPolicies;
    cacheHits++;
    cacheManager.recordHit();
  } else {
    try {
      logger.debug(`Smart reload: Reloading policies`);
      policiesResult = await loadPolicies(policiesPath, {
        maxPolicies: options.maxPolicies ?? config.execution?.maxPolicies,
      });
      cache.set(policiesPath, policiesResult, policiesResult.csvContent);
      cacheManager.recordCached('policies', policiesPath, policiesResult.csvContent);
      cacheMisses++;
      cacheManager.recordMiss();
    } catch (error) {
      throw wrapError(error, 'policies', policiesPath);
    }
  }

  allErrors.push(...policiesResult.errors);
  allWarnings.push(...policiesResult.warnings);

  if (validator) {
    validator.reportValidation(
      createValidationResult(policiesPath, 'policies', policiesResult.errors, policiesResult.warnings)
    );
  }

  // Load mortality table
  const mortalityPath = resolveDataPath(config.assumptions.mortality, configDir);
  if (!mortalityPath) {
    throw new DataLoadError('No mortality file specified in config', 'NO_MORTALITY_PATH');
  }

  let mortalityResult: MortalityLoadResult;
  const cachedMortality = !reloadMortality ? cache.get<MortalityLoadResult>(mortalityPath) : undefined;

  if (cachedMortality) {
    logger.debug(`Smart reload: Using cached mortality`);
    mortalityResult = cachedMortality;
    cacheHits++;
    cacheManager.recordHit();
  } else {
    try {
      logger.debug(`Smart reload: Reloading mortality`);
      mortalityResult = await loadMortality(mortalityPath);
      cache.set(mortalityPath, mortalityResult, mortalityResult.csvContent);
      cacheManager.recordCached('mortality', mortalityPath, mortalityResult.csvContent);
      cacheMisses++;
      cacheManager.recordMiss();
    } catch (error) {
      throw wrapError(error, 'mortality', mortalityPath);
    }
  }

  allErrors.push(...mortalityResult.errors);
  allWarnings.push(...mortalityResult.warnings);

  if (validator) {
    validator.reportValidation(
      createValidationResult(mortalityPath, 'mortality', mortalityResult.errors, mortalityResult.warnings)
    );
  }

  // Load lapse table
  const lapsePath = resolveDataPath(config.assumptions.lapse, configDir);
  if (!lapsePath) {
    throw new DataLoadError('No lapse file specified in config', 'NO_LAPSE_PATH');
  }

  let lapseResult: LapseLoadResult;
  const cachedLapse = !reloadLapse ? cache.get<LapseLoadResult>(lapsePath) : undefined;

  if (cachedLapse) {
    logger.debug(`Smart reload: Using cached lapse`);
    lapseResult = cachedLapse;
    cacheHits++;
    cacheManager.recordHit();
  } else {
    try {
      logger.debug(`Smart reload: Reloading lapse`);
      lapseResult = await loadLapse(lapsePath);
      cache.set(lapsePath, lapseResult, lapseResult.csvContent);
      cacheManager.recordCached('lapse', lapsePath, lapseResult.csvContent);
      cacheMisses++;
      cacheManager.recordMiss();
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
  const cachedExpenses = !reloadExpenses ? cache.get<ExpensesLoadResult>(expensesPath) : undefined;

  if (cachedExpenses) {
    logger.debug(`Smart reload: Using cached expenses`);
    expensesResult = cachedExpenses;
    cacheHits++;
    cacheManager.recordHit();
  } else {
    try {
      logger.debug(`Smart reload: Reloading expenses`);
      expensesResult = await loadExpenses(expensesPath);
      cache.set(expensesPath, expensesResult, expensesResult.csvContent);
      cacheManager.recordCached('expenses', expensesPath, expensesResult.csvContent);
      cacheMisses++;
      cacheManager.recordMiss();
    } catch (error) {
      throw wrapError(error, 'expenses', expensesPath);
    }
  }

  allErrors.push(...expensesResult.errors);
  allWarnings.push(...expensesResult.warnings);

  if (validator) {
    validator.reportValidation(
      createValidationResult(expensesPath, 'expenses', expensesResult.errors, expensesResult.warnings)
    );
  }

  // Log summary with smart reload stats
  const valid = allErrors.length === 0;
  logger.info(
    `Smart reload complete: ${policiesResult.count} policies, ` +
      `${allErrors.length} errors, ${allWarnings.length} warnings, ` +
      `cache hits: ${cacheHits}, misses: ${cacheMisses}`
  );

  // Log cache manager stats in debug mode
  cacheManager.logStats();

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
    assumptionMeta: {
      mortality: {
        filePath: mortalityResult.filePath,
        contentHash: mortalityResult.contentHash,
        modTime: mortalityResult.modTime,
        source: 'local',
      },
      lapse: {
        filePath: lapseResult.filePath,
        contentHash: lapseResult.contentHash,
        modTime: lapseResult.modTime,
        source: 'local',
      },
      expenses: {
        filePath: expensesResult.filePath,
        contentHash: expensesResult.contentHash,
        modTime: expensesResult.modTime,
        source: 'local',
      },
    },
  };
}

/**
 * Standard load with optional analysis attached
 */
async function loadDataWithAnalysis(
  config: LiveCalcConfig,
  configDir: string,
  options: DataLoadOptions,
  forceReload: boolean
): Promise<LoadResult> {
  // Call the standard load path but with forceReload
  const result = await loadDataStandard(config, configDir, { ...options, forceReload });
  return result;
}

/**
 * Standard data loading (original implementation)
 */
async function loadDataStandard(
  config: LiveCalcConfig,
  configDir: string,
  options: DataLoadOptions
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
    assumptionMeta: {
      mortality: {
        filePath: mortalityResult.filePath,
        contentHash: mortalityResult.contentHash,
        modTime: mortalityResult.modTime,
        source: 'local',
      },
      lapse: {
        filePath: lapseResult.filePath,
        contentHash: lapseResult.contentHash,
        modTime: lapseResult.modTime,
        source: 'local',
      },
      expenses: {
        filePath: expensesResult.filePath,
        contentHash: expensesResult.contentHash,
        modTime: expensesResult.modTime,
        source: 'local',
      },
    },
  };
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
export { calculateContentHash, getFileModTime } from './assumption-loader';

// Re-export AM resolver types for use in results display
export type { ResolvedAssumption } from '../assumptions-manager';
