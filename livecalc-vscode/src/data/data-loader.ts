/**
 * Data Loader for LiveCalc VS Code Extension
 *
 * Handles loading policy and assumption data from files specified in config.
 * This is a basic implementation that will be enhanced in US-006.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../logging/logger';
import type { LiveCalcConfig } from '../types';

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
 * Load all data files specified in the config
 *
 * @param config - LiveCalc configuration
 * @param configDir - Directory containing the config file (for resolving relative paths)
 */
export async function loadData(
  config: LiveCalcConfig,
  configDir: string
): Promise<LoadedData> {
  logger.debug(`Loading data from config directory: ${configDir}`);

  // Load policies
  const policiesPath = resolveDataPath(config.policies, configDir);
  if (!policiesPath) {
    throw new DataLoadError(
      'No policies file specified in config',
      'NO_POLICIES_PATH'
    );
  }
  const policiesCsv = await loadFile(policiesPath, 'policies');

  // Load mortality table
  const mortalityPath = resolveDataPath(config.assumptions.mortality, configDir);
  if (!mortalityPath) {
    throw new DataLoadError(
      'No mortality file specified in config',
      'NO_MORTALITY_PATH'
    );
  }
  const mortalityCsv = await loadFile(mortalityPath, 'mortality');

  // Load lapse table
  const lapsePath = resolveDataPath(config.assumptions.lapse, configDir);
  if (!lapsePath) {
    throw new DataLoadError(
      'No lapse file specified in config',
      'NO_LAPSE_PATH'
    );
  }
  const lapseCsv = await loadFile(lapsePath, 'lapse');

  // Load expenses - handle both CSV and JSON formats
  const expensesPath = resolveDataPath(config.assumptions.expenses, configDir);
  if (!expensesPath) {
    throw new DataLoadError(
      'No expenses file specified in config',
      'NO_EXPENSES_PATH'
    );
  }
  const expensesCsv = await loadExpenses(expensesPath);

  logger.info('All data files loaded successfully');

  return {
    policiesCsv,
    mortalityCsv,
    lapseCsv,
    expensesCsv,
  };
}

/**
 * Resolve a data path from config to an absolute file path
 *
 * Supports:
 * - local://path/to/file.csv - Relative to config directory
 * - Absolute paths
 * - Relative paths (relative to config directory)
 * - assumptions://name:version - Cloud assumption references (placeholder for US-006)
 */
function resolveDataPath(
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
 * Load a file and return its contents as a string
 */
async function loadFile(filePath: string, fileType: string): Promise<string> {
  logger.debug(`Loading ${fileType} from: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new DataLoadError(
      `${fileType} file not found: ${filePath}`,
      'FILE_NOT_FOUND',
      filePath
    );
  }

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');

    // Check if file is empty
    if (!content.trim()) {
      throw new DataLoadError(
        `${fileType} file is empty: ${filePath}`,
        'FILE_EMPTY',
        filePath
      );
    }

    // Log file size
    const lines = content.split('\n').length;
    logger.debug(`Loaded ${fileType}: ${lines} lines`);

    return content;
  } catch (error) {
    if (error instanceof DataLoadError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new DataLoadError(
      `Failed to read ${fileType} file: ${message}`,
      'FILE_READ_ERROR',
      filePath
    );
  }
}

/**
 * Load expenses file - supports both CSV and JSON formats
 */
async function loadExpenses(filePath: string): Promise<string> {
  const content = await loadFile(filePath, 'expenses');

  // Check if it's a JSON file
  if (filePath.endsWith('.json')) {
    return convertExpensesJsonToCsv(content, filePath);
  }

  // Assume CSV format
  return content;
}

/**
 * Convert expenses JSON to CSV format expected by the engine
 */
function convertExpensesJsonToCsv(jsonContent: string, filePath: string): string {
  try {
    const expenses = JSON.parse(jsonContent);

    // Build CSV format
    const lines = [
      'parameter,value',
      `per_policy_acquisition,${expenses.perPolicyAcquisition ?? expenses.PER_POLICY ?? 0}`,
      `per_policy_maintenance,${expenses.perPolicyMaintenance ?? expenses.PERCENT_PREMIUM ?? 0}`,
      `percent_of_premium,${expenses.percentOfPremium ?? 0}`,
      `claim_expense,${expenses.claimExpense ?? 0}`,
    ];

    return lines.join('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DataLoadError(
      `Invalid JSON in expenses file: ${message}`,
      'INVALID_JSON',
      filePath
    );
  }
}

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
  const header = 'age,male_qx,female_qx';
  const rows: string[] = [header];

  // Simplified mortality rates - actual tables would be more detailed
  for (let age = 0; age <= 120; age++) {
    // Simple Gompertz-like mortality: qx = A * exp(B * age)
    const maleQx = Math.min(0.00025 * Math.exp(0.08 * age), 1.0);
    const femaleQx = Math.min(0.00020 * Math.exp(0.08 * age), 1.0);
    rows.push(`${age},${maleQx.toFixed(8)},${femaleQx.toFixed(8)}`);
  }

  return rows.join('\n');
}

/**
 * Generate sample lapse CSV for testing
 */
export function generateSampleLapseCsv(): string {
  const header = 'year,lapse_rate';
  const rows: string[] = [header];

  // Typical lapse pattern: high in early years, declining over time
  const lapseRates = [
    0.10, 0.08, 0.06, 0.05, 0.04, // Years 1-5
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
