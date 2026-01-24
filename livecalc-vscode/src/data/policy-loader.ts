/**
 * Policy Loader
 *
 * Loads and validates policy data from CSV files.
 */

import * as path from 'path';
import {
  loadCsvFile,
  validateCsv,
  CsvResult,
  CsvOptions,
  CsvValidationError,
  CsvLoadError,
  checkFileSize,
} from './csv-loader';
import { logger } from '../logging/logger';
import type { Policy } from '../types';

/**
 * Required columns for policy CSV
 */
const POLICY_REQUIRED_COLUMNS = [
  'policy_id',
  'age',
  'gender',
  'sum_assured',
  'premium',
  'term',
  'product_type',
];

/**
 * Column type validation for policies
 */
const POLICY_COLUMN_TYPES: Record<string, 'number' | 'string' | 'integer'> = {
  policy_id: 'integer',
  age: 'integer',
  gender: 'string',
  sum_assured: 'number',
  premium: 'number',
  term: 'integer',
  product_type: 'string',
};

/**
 * Policy loading options
 */
export interface PolicyLoadOptions {
  /** Maximum number of policies to load */
  maxPolicies?: number;
  /** Validate data types strictly */
  strictValidation?: boolean;
}

/**
 * Policy loading result
 */
export interface PolicyLoadResult {
  /** Parsed policies */
  policies: Policy[];
  /** Raw CSV content for engine */
  csvContent: string;
  /** Number of policies loaded */
  count: number;
  /** Validation errors */
  errors: CsvValidationError[];
  /** Validation warnings */
  warnings: CsvValidationError[];
  /** File path */
  filePath: string;
}

/**
 * Load policies from a CSV file
 *
 * @param filePath - Path to the policy CSV file
 * @param options - Loading options
 * @returns Policy loading result
 */
export async function loadPolicies(
  filePath: string,
  options: PolicyLoadOptions = {}
): Promise<PolicyLoadResult> {
  logger.info(`Loading policies from: ${filePath}`);

  // Check file size before loading
  const sizeCheck = checkFileSize(filePath);
  if (!sizeCheck.ok) {
    throw new CsvLoadError(
      sizeCheck.error ?? 'File too large',
      'FILE_TOO_LARGE',
      filePath
    );
  }

  if (sizeCheck.warning) {
    logger.warn(sizeCheck.warning);
  }

  // Load and parse CSV
  const csvOptions: CsvOptions = {
    requiredColumns: POLICY_REQUIRED_COLUMNS,
    columnTypes: POLICY_COLUMN_TYPES,
    minRows: 1,
    maxRows: options.maxPolicies,
    allowExtraColumns: true,
  };

  const csv = await loadCsvFile(filePath, csvOptions);

  // Validate structure
  const validation = validateCsv(csv, csvOptions, filePath);

  // Additional policy-specific validation
  const policyErrors = validatePolicyData(csv);
  validation.errors.push(...policyErrors.errors);
  validation.warnings.push(...policyErrors.warnings);

  // Parse policies from CSV
  const policies = parsePolicies(csv);

  // Check max policies limit
  if (options.maxPolicies && policies.length > options.maxPolicies) {
    validation.warnings.push({
      message: `Loaded ${policies.length} policies, exceeds configured maximum of ${options.maxPolicies}`,
      severity: 'warning',
    });
  }

  logger.info(`Loaded ${policies.length} policies with ${validation.errors.length} errors`);

  return {
    policies,
    csvContent: csv.rawContent,
    count: policies.length,
    errors: validation.errors,
    warnings: validation.warnings,
    filePath,
  };
}

/**
 * Parse policies from CSV data
 */
function parsePolicies(csv: CsvResult): Policy[] {
  const policies: Policy[] = [];

  for (const row of csv.rows) {
    try {
      const policy: Policy = {
        policyId: parseInt(row['policy_id'], 10),
        age: parseInt(row['age'], 10),
        gender: normalizeGender(row['gender']),
        sumAssured: parseFloat(row['sum_assured']),
        premium: parseFloat(row['premium']),
        term: parseInt(row['term'], 10),
        productType: row['product_type'] || 'TERM',
      };

      // Skip invalid policies
      if (isNaN(policy.policyId) || isNaN(policy.age) || isNaN(policy.sumAssured)) {
        continue;
      }

      policies.push(policy);
    } catch {
      // Skip malformed rows, errors captured in validation
      continue;
    }
  }

  return policies;
}

/**
 * Normalize gender value to 'M' or 'F'
 */
function normalizeGender(value: string): 'M' | 'F' {
  const upper = value.toUpperCase().trim();

  if (upper === 'M' || upper === 'MALE' || upper === '1') {
    return 'M';
  }

  if (upper === 'F' || upper === 'FEMALE' || upper === '0' || upper === '2') {
    return 'F';
  }

  // Default to Male if unrecognized
  return 'M';
}

/**
 * Validate policy-specific data constraints
 */
function validatePolicyData(csv: CsvResult): {
  errors: CsvValidationError[];
  warnings: CsvValidationError[];
} {
  const errors: CsvValidationError[] = [];
  const warnings: CsvValidationError[] = [];
  const seenPolicyIds = new Set<number>();

  for (let i = 0; i < csv.rows.length; i++) {
    const row = csv.rows[i];
    const lineNum = i + 2; // +2 for header and 0-based index

    // Check for duplicate policy IDs
    const policyId = parseInt(row['policy_id'], 10);
    if (!isNaN(policyId)) {
      if (seenPolicyIds.has(policyId)) {
        warnings.push({
          message: `Duplicate policy_id: ${policyId}`,
          line: lineNum,
          column: 'policy_id',
          severity: 'warning',
        });
      }
      seenPolicyIds.add(policyId);
    }

    // Validate age range
    const age = parseInt(row['age'], 10);
    if (!isNaN(age)) {
      if (age < 0) {
        errors.push({
          message: `Invalid age: ${age} (cannot be negative)`,
          line: lineNum,
          column: 'age',
          severity: 'error',
        });
      } else if (age > 120) {
        warnings.push({
          message: `Unusual age: ${age} (greater than 120)`,
          line: lineNum,
          column: 'age',
          severity: 'warning',
        });
      }
    }

    // Validate gender
    const gender = row['gender']?.toUpperCase().trim();
    if (gender && !['M', 'F', 'MALE', 'FEMALE', '0', '1', '2'].includes(gender)) {
      warnings.push({
        message: `Unrecognized gender: "${row['gender']}" (defaulting to M)`,
        line: lineNum,
        column: 'gender',
        severity: 'warning',
      });
    }

    // Validate sum assured
    const sumAssured = parseFloat(row['sum_assured']);
    if (!isNaN(sumAssured) && sumAssured <= 0) {
      errors.push({
        message: `Invalid sum_assured: ${sumAssured} (must be positive)`,
        line: lineNum,
        column: 'sum_assured',
        severity: 'error',
      });
    }

    // Validate premium
    const premium = parseFloat(row['premium']);
    if (!isNaN(premium) && premium < 0) {
      errors.push({
        message: `Invalid premium: ${premium} (cannot be negative)`,
        line: lineNum,
        column: 'premium',
        severity: 'error',
      });
    }

    // Validate term
    const term = parseInt(row['term'], 10);
    if (!isNaN(term)) {
      if (term <= 0) {
        errors.push({
          message: `Invalid term: ${term} (must be positive)`,
          line: lineNum,
          column: 'term',
          severity: 'error',
        });
      } else if (term > 50) {
        warnings.push({
          message: `Unusual term: ${term} years (greater than 50)`,
          line: lineNum,
          column: 'term',
          severity: 'warning',
        });
      }
    }
  }

  return { errors, warnings };
}

/**
 * Generate CSV content from policies (for cache invalidation testing)
 */
export function policiesToCsv(policies: Policy[]): string {
  const header = POLICY_REQUIRED_COLUMNS.join(',');
  const rows = policies.map(
    (p) =>
      `${p.policyId},${p.age},${p.gender},${p.sumAssured},${p.premium},${p.term},${p.productType}`
  );

  return [header, ...rows].join('\n');
}
