/**
 * Generic CSV Loader with Validation
 *
 * Provides CSV parsing with structure validation, data type checking,
 * and detailed error reporting for the VS Code Problems panel.
 */

import * as fs from 'fs';
import { logger } from '../logging/logger';

/**
 * CSV parsing options
 */
export interface CsvOptions {
  /** Required column names (case-insensitive) */
  requiredColumns?: string[];
  /** Optional column names to validate if present */
  optionalColumns?: string[];
  /** Expected column data types */
  columnTypes?: Record<string, 'number' | 'string' | 'integer'>;
  /** Minimum number of data rows */
  minRows?: number;
  /** Maximum number of data rows */
  maxRows?: number;
  /** Allow extra columns not in required/optional */
  allowExtraColumns?: boolean;
  /** Delimiter character (default: comma) */
  delimiter?: string;
}

/**
 * Parsed CSV result
 */
export interface CsvResult {
  /** Column headers (normalized to lowercase) */
  headers: string[];
  /** Original column headers (preserving case) */
  originalHeaders: string[];
  /** Data rows as objects keyed by lowercase header */
  rows: Record<string, string>[];
  /** Raw data rows as arrays */
  rawRows: string[][];
  /** Number of data rows */
  rowCount: number;
  /** Raw CSV content */
  rawContent: string;
}

/**
 * Validation error with location information
 */
export interface CsvValidationError {
  message: string;
  line?: number;
  column?: string;
  severity: 'error' | 'warning';
}

/**
 * CSV validation result
 */
export interface CsvValidationResult {
  valid: boolean;
  errors: CsvValidationError[];
  warnings: CsvValidationError[];
}

/**
 * Parse and validate a CSV file
 *
 * @param filePath - Path to the CSV file
 * @param options - Parsing and validation options
 * @returns Parsed CSV data
 * @throws Error if file cannot be read or parsed
 */
export async function loadCsvFile(
  filePath: string,
  options: CsvOptions = {}
): Promise<CsvResult> {
  logger.debug(`Loading CSV file: ${filePath}`);

  // Read file
  if (!fs.existsSync(filePath)) {
    throw new CsvLoadError(`File not found: ${filePath}`, 'FILE_NOT_FOUND', filePath);
  }

  const content = await fs.promises.readFile(filePath, 'utf-8');

  if (!content.trim()) {
    throw new CsvLoadError(`File is empty: ${filePath}`, 'FILE_EMPTY', filePath);
  }

  return parseCsv(content, options);
}

/**
 * Parse CSV content string
 *
 * @param content - CSV string content
 * @param options - Parsing options
 * @returns Parsed CSV data
 */
export function parseCsv(content: string, options: CsvOptions = {}): CsvResult {
  const delimiter = options.delimiter ?? ',';
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    throw new CsvLoadError('CSV content is empty', 'EMPTY_CONTENT');
  }

  // Parse header row
  const originalHeaders = parseRow(lines[0], delimiter);
  const headers = originalHeaders.map((h) => h.toLowerCase().trim());

  // Parse data rows
  const rawRows: string[][] = [];
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i], delimiter);

    // Skip empty rows
    if (values.length === 0 || (values.length === 1 && values[0] === '')) {
      continue;
    }

    rawRows.push(values);

    // Create object with header keys
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }

  logger.debug(`Parsed CSV: ${headers.length} columns, ${rows.length} rows`);

  return {
    headers,
    originalHeaders,
    rows,
    rawRows,
    rowCount: rows.length,
    rawContent: content,
  };
}

/**
 * Parse a single CSV row, handling quoted values
 */
function parseRow(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
      i++;
      continue;
    }

    current += char;
    i++;
  }

  values.push(current.trim());
  return values;
}

/**
 * Validate parsed CSV against options
 *
 * @param csv - Parsed CSV result
 * @param options - Validation options
 * @param filePath - File path for error reporting
 * @returns Validation result with errors and warnings
 */
export function validateCsv(
  csv: CsvResult,
  options: CsvOptions,
  filePath?: string
): CsvValidationResult {
  const errors: CsvValidationError[] = [];
  const warnings: CsvValidationError[] = [];

  // Check required columns
  if (options.requiredColumns) {
    for (const required of options.requiredColumns) {
      const normalizedRequired = required.toLowerCase();
      if (!csv.headers.includes(normalizedRequired)) {
        errors.push({
          message: `Missing required column: ${required}`,
          line: 1,
          column: required,
          severity: 'error',
        });
      }
    }
  }

  // Check for extra columns
  if (!options.allowExtraColumns && options.requiredColumns) {
    const allowed = new Set([
      ...options.requiredColumns.map((c) => c.toLowerCase()),
      ...(options.optionalColumns?.map((c) => c.toLowerCase()) ?? []),
    ]);

    for (const header of csv.headers) {
      if (!allowed.has(header)) {
        warnings.push({
          message: `Unexpected column: ${header}`,
          line: 1,
          column: header,
          severity: 'warning',
        });
      }
    }
  }

  // Check row count
  if (options.minRows !== undefined && csv.rowCount < options.minRows) {
    errors.push({
      message: `File has ${csv.rowCount} data rows, minimum required is ${options.minRows}`,
      severity: 'error',
    });
  }

  if (options.maxRows !== undefined && csv.rowCount > options.maxRows) {
    warnings.push({
      message: `File has ${csv.rowCount} data rows, maximum recommended is ${options.maxRows}`,
      severity: 'warning',
    });
  }

  // Validate data types
  if (options.columnTypes) {
    for (let rowIndex = 0; rowIndex < csv.rows.length; rowIndex++) {
      const row = csv.rows[rowIndex];

      for (const [column, expectedType] of Object.entries(options.columnTypes)) {
        const normalizedColumn = column.toLowerCase();
        const value = row[normalizedColumn];

        if (value === undefined || value === '') {
          continue; // Skip empty values
        }

        const typeError = validateType(value, expectedType);
        if (typeError) {
          errors.push({
            message: `Invalid value in column "${column}" row ${rowIndex + 2}: ${typeError}`,
            line: rowIndex + 2, // +2 for header row and 0-based index
            column: column,
            severity: 'error',
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a value against an expected type
 */
function validateType(
  value: string,
  expectedType: 'number' | 'string' | 'integer'
): string | null {
  switch (expectedType) {
    case 'number': {
      const num = parseFloat(value);
      if (isNaN(num)) {
        return `expected number, got "${value}"`;
      }
      return null;
    }
    case 'integer': {
      const num = parseInt(value, 10);
      if (isNaN(num) || num.toString() !== value) {
        return `expected integer, got "${value}"`;
      }
      return null;
    }
    case 'string':
      return null; // Any value is valid as string
  }
}

/**
 * CSV loading error with additional metadata
 */
export class CsvLoadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly filePath?: string,
    public readonly line?: number,
    public readonly column?: string
  ) {
    super(message);
    this.name = 'CsvLoadError';
  }
}

/**
 * Get estimated file size info
 */
export function getFileSizeInfo(filePath: string): { sizeBytes: number; sizeMB: number } {
  try {
    const stats = fs.statSync(filePath);
    return {
      sizeBytes: stats.size,
      sizeMB: stats.size / (1024 * 1024),
    };
  } catch {
    return { sizeBytes: 0, sizeMB: 0 };
  }
}

/**
 * Check if file size is within acceptable limits
 *
 * @param filePath - Path to file
 * @param warnThresholdMB - Size in MB to warn (default: 100MB)
 * @param maxThresholdMB - Maximum size in MB (default: 500MB)
 */
export function checkFileSize(
  filePath: string,
  warnThresholdMB: number = 100,
  maxThresholdMB: number = 500
): { ok: boolean; warning?: string; error?: string } {
  const { sizeMB } = getFileSizeInfo(filePath);

  if (sizeMB > maxThresholdMB) {
    return {
      ok: false,
      error: `File size (${sizeMB.toFixed(1)}MB) exceeds maximum of ${maxThresholdMB}MB`,
    };
  }

  if (sizeMB > warnThresholdMB) {
    return {
      ok: true,
      warning: `Large file (${sizeMB.toFixed(1)}MB) may take longer to process`,
    };
  }

  return { ok: true };
}
