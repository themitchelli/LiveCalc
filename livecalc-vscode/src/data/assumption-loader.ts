/**
 * Assumption Loader
 *
 * Loads and validates assumption data (mortality, lapse, expenses)
 * from CSV and JSON files.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  loadCsvFile,
  validateCsv,
  CsvResult,
  CsvOptions,
  CsvValidationError,
  CsvLoadError,
} from './csv-loader';
import { logger } from '../logging/logger';
import type { ExpenseAssumptions } from '../types';

/**
 * Calculate MD5 hash of content for reproducibility tracking
 */
export function calculateContentHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 12);
}

/**
 * Get file modification time as ISO string
 */
export function getFileModTime(filePath: string): string | undefined {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime.toISOString();
  } catch {
    return undefined;
  }
}

// ============================================================================
// Mortality Table Loading
// ============================================================================

/**
 * Required columns for mortality CSV (either format)
 */
const MORTALITY_AGE_COLUMN = 'age';
const MORTALITY_MALE_COLUMNS = ['male', 'male_qx', 'm', 'qx_male'];
const MORTALITY_FEMALE_COLUMNS = ['female', 'female_qx', 'f', 'qx_female'];

/**
 * Mortality loading result
 */
export interface MortalityLoadResult {
  /** Raw CSV content for engine */
  csvContent: string;
  /** Number of age rows */
  ageCount: number;
  /** Age range */
  ageRange: { min: number; max: number };
  /** Validation errors */
  errors: CsvValidationError[];
  /** Validation warnings */
  warnings: CsvValidationError[];
  /** File path */
  filePath: string;
  /** Content hash for reproducibility */
  contentHash: string;
  /** File modification time at load */
  modTime?: string;
}

/**
 * Load mortality table from CSV file
 *
 * Supports two column naming conventions:
 * - age, male, female
 * - age, male_qx, female_qx
 *
 * @param filePath - Path to mortality CSV file
 * @returns Mortality loading result
 */
export async function loadMortality(filePath: string): Promise<MortalityLoadResult> {
  logger.info(`Loading mortality table from: ${filePath}`);

  // Load CSV with flexible column requirements
  const csv = await loadCsvFile(filePath);

  // Find the actual column names used
  const ageCol = csv.headers.find((h) => h === 'age');
  const maleCol = csv.headers.find((h) => MORTALITY_MALE_COLUMNS.includes(h));
  const femaleCol = csv.headers.find((h) => MORTALITY_FEMALE_COLUMNS.includes(h));

  const errors: CsvValidationError[] = [];
  const warnings: CsvValidationError[] = [];

  // Validate required columns exist
  if (!ageCol) {
    errors.push({
      message: 'Missing required column: age',
      line: 1,
      column: 'age',
      severity: 'error',
    });
  }

  if (!maleCol) {
    errors.push({
      message: `Missing male mortality column. Expected one of: ${MORTALITY_MALE_COLUMNS.join(', ')}`,
      line: 1,
      severity: 'error',
    });
  }

  if (!femaleCol) {
    errors.push({
      message: `Missing female mortality column. Expected one of: ${MORTALITY_FEMALE_COLUMNS.join(', ')}`,
      line: 1,
      severity: 'error',
    });
  }

  // Validate mortality data
  const mortValidation = validateMortalityData(csv, ageCol, maleCol, femaleCol);
  errors.push(...mortValidation.errors);
  warnings.push(...mortValidation.warnings);

  // Calculate age range
  const ages = csv.rows
    .map((r) => parseInt(r[ageCol ?? 'age'], 10))
    .filter((a) => !isNaN(a));
  const ageRange = {
    min: Math.min(...ages),
    max: Math.max(...ages),
  };

  // Warn if age range doesn't cover expected range (0-120)
  if (ageRange.min > 0) {
    warnings.push({
      message: `Mortality table starts at age ${ageRange.min}, ages 0-${ageRange.min - 1} will use age ${ageRange.min} rates`,
      severity: 'warning',
    });
  }

  if (ageRange.max < 120) {
    warnings.push({
      message: `Mortality table ends at age ${ageRange.max}, ages ${ageRange.max + 1}-120 will use age ${ageRange.max} rates`,
      severity: 'warning',
    });
  }

  // Calculate content hash and get file modification time
  const contentHash = calculateContentHash(csv.rawContent);
  const modTime = getFileModTime(filePath);

  logger.info(
    `Loaded mortality table: ${csv.rowCount} age rows, range ${ageRange.min}-${ageRange.max}`
  );

  return {
    csvContent: csv.rawContent,
    ageCount: csv.rowCount,
    ageRange,
    errors,
    warnings,
    filePath,
    contentHash,
    modTime,
  };
}

/**
 * Validate mortality-specific data constraints
 */
function validateMortalityData(
  csv: CsvResult,
  ageCol?: string,
  maleCol?: string,
  femaleCol?: string
): { errors: CsvValidationError[]; warnings: CsvValidationError[] } {
  const errors: CsvValidationError[] = [];
  const warnings: CsvValidationError[] = [];

  if (!ageCol || !maleCol || !femaleCol) {
    return { errors, warnings };
  }

  const seenAges = new Set<number>();

  for (let i = 0; i < csv.rows.length; i++) {
    const row = csv.rows[i];
    const lineNum = i + 2;

    // Validate age
    const age = parseInt(row[ageCol], 10);
    if (isNaN(age)) {
      errors.push({
        message: `Invalid age value: "${row[ageCol]}"`,
        line: lineNum,
        column: ageCol,
        severity: 'error',
      });
      continue;
    }

    // Check for duplicate ages
    if (seenAges.has(age)) {
      warnings.push({
        message: `Duplicate age entry: ${age}`,
        line: lineNum,
        column: ageCol,
        severity: 'warning',
      });
    }
    seenAges.add(age);

    // Validate male qx
    const maleQx = parseFloat(row[maleCol]);
    if (isNaN(maleQx)) {
      errors.push({
        message: `Invalid male mortality rate: "${row[maleCol]}"`,
        line: lineNum,
        column: maleCol,
        severity: 'error',
      });
    } else if (maleQx < 0 || maleQx > 1) {
      errors.push({
        message: `Male mortality rate out of range [0,1]: ${maleQx}`,
        line: lineNum,
        column: maleCol,
        severity: 'error',
      });
    }

    // Validate female qx
    const femaleQx = parseFloat(row[femaleCol]);
    if (isNaN(femaleQx)) {
      errors.push({
        message: `Invalid female mortality rate: "${row[femaleCol]}"`,
        line: lineNum,
        column: femaleCol,
        severity: 'error',
      });
    } else if (femaleQx < 0 || femaleQx > 1) {
      errors.push({
        message: `Female mortality rate out of range [0,1]: ${femaleQx}`,
        line: lineNum,
        column: femaleCol,
        severity: 'error',
      });
    }
  }

  return { errors, warnings };
}

// ============================================================================
// Lapse Table Loading
// ============================================================================

/**
 * Expected columns for lapse CSV
 */
const LAPSE_YEAR_COLUMNS = ['year', 'policy_year', 'duration'];
const LAPSE_RATE_COLUMNS = ['rate', 'lapse_rate', 'lapse'];

/**
 * Lapse loading result
 */
export interface LapseLoadResult {
  /** Raw CSV content for engine */
  csvContent: string;
  /** Number of year rows */
  yearCount: number;
  /** Year range */
  yearRange: { min: number; max: number };
  /** Validation errors */
  errors: CsvValidationError[];
  /** Validation warnings */
  warnings: CsvValidationError[];
  /** File path */
  filePath: string;
  /** Content hash for reproducibility */
  contentHash: string;
  /** File modification time at load */
  modTime?: string;
}

/**
 * Load lapse table from CSV file
 *
 * @param filePath - Path to lapse CSV file
 * @returns Lapse loading result
 */
export async function loadLapse(filePath: string): Promise<LapseLoadResult> {
  logger.info(`Loading lapse table from: ${filePath}`);

  const csv = await loadCsvFile(filePath);

  // Find column names
  const yearCol = csv.headers.find((h) => LAPSE_YEAR_COLUMNS.includes(h));
  const rateCol = csv.headers.find((h) => LAPSE_RATE_COLUMNS.includes(h));

  const errors: CsvValidationError[] = [];
  const warnings: CsvValidationError[] = [];

  if (!yearCol) {
    errors.push({
      message: `Missing year column. Expected one of: ${LAPSE_YEAR_COLUMNS.join(', ')}`,
      line: 1,
      severity: 'error',
    });
  }

  if (!rateCol) {
    errors.push({
      message: `Missing rate column. Expected one of: ${LAPSE_RATE_COLUMNS.join(', ')}`,
      line: 1,
      severity: 'error',
    });
  }

  // Validate lapse data
  const lapseValidation = validateLapseData(csv, yearCol, rateCol);
  errors.push(...lapseValidation.errors);
  warnings.push(...lapseValidation.warnings);

  // Calculate year range
  const years = csv.rows
    .map((r) => parseInt(r[yearCol ?? 'year'], 10))
    .filter((y) => !isNaN(y));
  const yearRange = {
    min: Math.min(...years),
    max: Math.max(...years),
  };

  // Warn if year range doesn't start at 1 or extend to 50
  if (yearRange.min > 1) {
    warnings.push({
      message: `Lapse table starts at year ${yearRange.min}, years 1-${yearRange.min - 1} will use year ${yearRange.min} rates`,
      severity: 'warning',
    });
  }

  if (yearRange.max < 50) {
    warnings.push({
      message: `Lapse table ends at year ${yearRange.max}, years ${yearRange.max + 1}-50 will use year ${yearRange.max} rates`,
      severity: 'warning',
    });
  }

  // Calculate content hash and get file modification time
  const contentHash = calculateContentHash(csv.rawContent);
  const modTime = getFileModTime(filePath);

  logger.info(`Loaded lapse table: ${csv.rowCount} year rows, range ${yearRange.min}-${yearRange.max}`);

  return {
    csvContent: csv.rawContent,
    yearCount: csv.rowCount,
    yearRange,
    errors,
    warnings,
    filePath,
    contentHash,
    modTime,
  };
}

/**
 * Validate lapse-specific data constraints
 */
function validateLapseData(
  csv: CsvResult,
  yearCol?: string,
  rateCol?: string
): { errors: CsvValidationError[]; warnings: CsvValidationError[] } {
  const errors: CsvValidationError[] = [];
  const warnings: CsvValidationError[] = [];

  if (!yearCol || !rateCol) {
    return { errors, warnings };
  }

  const seenYears = new Set<number>();

  for (let i = 0; i < csv.rows.length; i++) {
    const row = csv.rows[i];
    const lineNum = i + 2;

    // Validate year
    const year = parseInt(row[yearCol], 10);
    if (isNaN(year)) {
      errors.push({
        message: `Invalid year value: "${row[yearCol]}"`,
        line: lineNum,
        column: yearCol,
        severity: 'error',
      });
      continue;
    }

    if (year < 1) {
      errors.push({
        message: `Year must be positive: ${year}`,
        line: lineNum,
        column: yearCol,
        severity: 'error',
      });
    }

    // Check for duplicate years
    if (seenYears.has(year)) {
      warnings.push({
        message: `Duplicate year entry: ${year}`,
        line: lineNum,
        column: yearCol,
        severity: 'warning',
      });
    }
    seenYears.add(year);

    // Validate lapse rate
    const rate = parseFloat(row[rateCol]);
    if (isNaN(rate)) {
      errors.push({
        message: `Invalid lapse rate: "${row[rateCol]}"`,
        line: lineNum,
        column: rateCol,
        severity: 'error',
      });
    } else if (rate < 0 || rate > 1) {
      errors.push({
        message: `Lapse rate out of range [0,1]: ${rate}`,
        line: lineNum,
        column: rateCol,
        severity: 'error',
      });
    }
  }

  return { errors, warnings };
}

// ============================================================================
// Expenses Loading
// ============================================================================

/**
 * Expenses loading result
 */
export interface ExpensesLoadResult {
  /** Raw CSV content for engine */
  csvContent: string;
  /** Parsed expenses (for display/validation) */
  expenses: ExpenseAssumptions;
  /** Validation errors */
  errors: CsvValidationError[];
  /** Validation warnings */
  warnings: CsvValidationError[];
  /** File path */
  filePath: string;
  /** Content hash for reproducibility */
  contentHash: string;
  /** File modification time at load */
  modTime?: string;
}

/**
 * Load expenses from CSV or JSON file
 *
 * @param filePath - Path to expenses file
 * @returns Expenses loading result
 */
export async function loadExpenses(filePath: string): Promise<ExpensesLoadResult> {
  logger.info(`Loading expenses from: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new CsvLoadError(`File not found: ${filePath}`, 'FILE_NOT_FOUND', filePath);
  }

  const content = await fs.promises.readFile(filePath, 'utf-8');

  if (!content.trim()) {
    throw new CsvLoadError(`File is empty: ${filePath}`, 'FILE_EMPTY', filePath);
  }

  // Handle JSON format
  if (filePath.endsWith('.json')) {
    return loadExpensesFromJson(content, filePath);
  }

  // Handle CSV format
  return loadExpensesFromCsv(content, filePath);
}

/**
 * Load expenses from JSON content
 */
function loadExpensesFromJson(
  content: string,
  filePath: string
): ExpensesLoadResult {
  const errors: CsvValidationError[] = [];
  const warnings: CsvValidationError[] = [];

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(content);
  } catch (e) {
    throw new CsvLoadError(
      `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      'INVALID_JSON',
      filePath
    );
  }

  // Parse expenses with flexible field names
  const expenses: ExpenseAssumptions = {
    perPolicyAcquisition:
      parseNumber(json.perPolicyAcquisition) ??
      parseNumber(json.per_policy_acquisition) ??
      parseNumber(json.acquisition) ??
      0,
    perPolicyMaintenance:
      parseNumber(json.perPolicyMaintenance) ??
      parseNumber(json.per_policy_maintenance) ??
      parseNumber(json.maintenance) ??
      0,
    percentOfPremium:
      parseNumber(json.percentOfPremium) ??
      parseNumber(json.percent_of_premium) ??
      parseNumber(json.percentPremium) ??
      0,
    perClaim:
      parseNumber(json.perClaim) ??
      parseNumber(json.per_claim) ??
      parseNumber(json.claim_expense) ??
      parseNumber(json.claimExpense) ??
      0,
  };

  // Validate expense values
  validateExpenseValues(expenses, errors, warnings);

  // Convert to CSV format for engine
  const csvContent = expensesToCsv(expenses);

  // Calculate content hash and get file modification time
  const contentHash = calculateContentHash(content);
  const modTime = getFileModTime(filePath);

  logger.info(
    `Loaded expenses: acquisition=${expenses.perPolicyAcquisition}, ` +
      `maintenance=${expenses.perPolicyMaintenance}, ` +
      `%premium=${expenses.percentOfPremium}, ` +
      `claim=${expenses.perClaim}`
  );

  return {
    csvContent,
    expenses,
    errors,
    warnings,
    filePath,
    contentHash,
    modTime,
  };
}

/**
 * Load expenses from CSV content
 */
function loadExpensesFromCsv(content: string, filePath: string): ExpensesLoadResult {
  const errors: CsvValidationError[] = [];
  const warnings: CsvValidationError[] = [];

  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    throw new CsvLoadError(
      'Expenses CSV must have header and at least one data row',
      'INVALID_FORMAT',
      filePath
    );
  }

  // Parse as parameter,value format
  const params: Record<string, number> = {};

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 2) {
      const key = parts[0].trim().toLowerCase();
      const value = parseFloat(parts[1].trim());
      if (!isNaN(value)) {
        params[key] = value;
      }
    }
  }

  const expenses: ExpenseAssumptions = {
    perPolicyAcquisition:
      params['per_policy_acquisition'] ?? params['acquisition'] ?? 0,
    perPolicyMaintenance:
      params['per_policy_maintenance'] ?? params['maintenance'] ?? 0,
    percentOfPremium:
      params['percent_of_premium'] ?? params['percentpremium'] ?? 0,
    perClaim: params['claim_expense'] ?? params['per_claim'] ?? 0,
  };

  // Validate expense values
  validateExpenseValues(expenses, errors, warnings);

  // Calculate content hash and get file modification time
  const contentHash = calculateContentHash(content);
  const modTime = getFileModTime(filePath);

  logger.info(
    `Loaded expenses from CSV: acquisition=${expenses.perPolicyAcquisition}, ` +
      `maintenance=${expenses.perPolicyMaintenance}`
  );

  return {
    csvContent: content,
    expenses,
    errors,
    warnings,
    filePath,
    contentHash,
    modTime,
  };
}

/**
 * Validate expense values
 */
function validateExpenseValues(
  expenses: ExpenseAssumptions,
  errors: CsvValidationError[],
  warnings: CsvValidationError[]
): void {
  if (expenses.perPolicyAcquisition < 0) {
    errors.push({
      message: `Per-policy acquisition expense cannot be negative: ${expenses.perPolicyAcquisition}`,
      severity: 'error',
    });
  }

  if (expenses.perPolicyMaintenance < 0) {
    errors.push({
      message: `Per-policy maintenance expense cannot be negative: ${expenses.perPolicyMaintenance}`,
      severity: 'error',
    });
  }

  if (expenses.percentOfPremium < 0 || expenses.percentOfPremium > 1) {
    if (expenses.percentOfPremium > 1 && expenses.percentOfPremium <= 100) {
      // Likely percentage instead of decimal
      warnings.push({
        message: `Percent of premium (${expenses.percentOfPremium}) appears to be a percentage. Value should be decimal (e.g., 0.02 for 2%)`,
        severity: 'warning',
      });
    } else {
      errors.push({
        message: `Percent of premium out of range [0,1]: ${expenses.percentOfPremium}`,
        severity: 'error',
      });
    }
  }

  if (expenses.perClaim < 0) {
    errors.push({
      message: `Per-claim expense cannot be negative: ${expenses.perClaim}`,
      severity: 'error',
    });
  }
}

/**
 * Convert expenses to CSV format for engine
 */
export function expensesToCsv(expenses: ExpenseAssumptions): string {
  return `parameter,value
per_policy_acquisition,${expenses.perPolicyAcquisition}
per_policy_maintenance,${expenses.perPolicyMaintenance}
percent_of_premium,${expenses.percentOfPremium}
claim_expense,${expenses.perClaim}`;
}

/**
 * Parse a number from unknown value
 */
function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      return num;
    }
  }
  return undefined;
}
