/**
 * Data Validator
 *
 * Reports data validation errors to VS Code Problems panel.
 * Integrates with the modular loaders to provide unified error reporting.
 */

import * as vscode from 'vscode';
import { CsvValidationError } from './csv-loader';
import { logger } from '../logging/logger';

/**
 * Data validation result from any loader
 */
export interface DataValidationResult {
  valid: boolean;
  errors: CsvValidationError[];
  warnings: CsvValidationError[];
  filePath: string;
  dataType: 'policies' | 'mortality' | 'lapse' | 'expenses';
}

/**
 * Data validator that reports to VS Code Problems panel
 */
export class DataValidator implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('livecalc-data');
  }

  /**
   * Report validation results for a data file
   *
   * @param result - Validation result from loader
   */
  public reportValidation(result: DataValidationResult): void {
    const uri = vscode.Uri.file(result.filePath);
    const diagnostics: vscode.Diagnostic[] = [];

    // Add errors
    for (const error of result.errors) {
      const diagnostic = this.createDiagnostic(
        error,
        vscode.DiagnosticSeverity.Error,
        result.dataType
      );
      diagnostics.push(diagnostic);
    }

    // Add warnings
    for (const warning of result.warnings) {
      const diagnostic = this.createDiagnostic(
        warning,
        vscode.DiagnosticSeverity.Warning,
        result.dataType
      );
      diagnostics.push(diagnostic);
    }

    this.diagnosticCollection.set(uri, diagnostics);

    if (result.errors.length > 0) {
      logger.warn(
        `${result.dataType} file has ${result.errors.length} errors: ${result.filePath}`
      );
    }
    if (result.warnings.length > 0) {
      logger.debug(
        `${result.dataType} file has ${result.warnings.length} warnings: ${result.filePath}`
      );
    }
  }

  /**
   * Report multiple validation results
   */
  public reportMultiple(results: DataValidationResult[]): void {
    for (const result of results) {
      this.reportValidation(result);
    }
  }

  /**
   * Clear diagnostics for a specific file
   */
  public clearFile(filePath: string): void {
    const uri = vscode.Uri.file(filePath);
    this.diagnosticCollection.delete(uri);
  }

  /**
   * Clear all data validation diagnostics
   */
  public clearAll(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * Check if there are any errors (not warnings) for a file
   */
  public hasErrors(filePath: string): boolean {
    const uri = vscode.Uri.file(filePath);
    const diagnostics = this.diagnosticCollection.get(uri);

    if (!diagnostics) {
      return false;
    }

    return diagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Error);
  }

  /**
   * Check if there are any errors across all data files
   */
  public hasAnyErrors(): boolean {
    let hasErrors = false;

    this.diagnosticCollection.forEach((uri, diagnostics) => {
      if (diagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Error)) {
        hasErrors = true;
      }
    });

    return hasErrors;
  }

  /**
   * Get all current diagnostics as a summary
   */
  public getSummary(): { files: number; errors: number; warnings: number } {
    let files = 0;
    let errors = 0;
    let warnings = 0;

    this.diagnosticCollection.forEach((uri, diagnostics) => {
      if (diagnostics.length > 0) {
        files++;
        for (const d of diagnostics) {
          if (d.severity === vscode.DiagnosticSeverity.Error) {
            errors++;
          } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
            warnings++;
          }
        }
      }
    });

    return { files, errors, warnings };
  }

  /**
   * Create a VS Code diagnostic from a validation error
   */
  private createDiagnostic(
    error: CsvValidationError,
    severity: vscode.DiagnosticSeverity,
    dataType: string
  ): vscode.Diagnostic {
    // Default to line 0 if not specified
    const line = error.line ?? 0;

    // Create range - if column specified, highlight that cell
    // Otherwise highlight the whole line
    const range = new vscode.Range(
      new vscode.Position(line, 0),
      new vscode.Position(line, error.column ? error.column.length + 10 : 1000)
    );

    const diagnostic = new vscode.Diagnostic(range, error.message, severity);

    diagnostic.source = `LiveCalc (${dataType})`;

    // Use column name as code if available
    if (error.column) {
      diagnostic.code = error.column;
    }

    return diagnostic;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.diagnosticCollection.dispose();
  }
}

/**
 * Global validator instance
 */
let globalValidator: DataValidator | undefined;

/**
 * Get the global data validator instance
 */
export function getDataValidator(): DataValidator {
  if (!globalValidator) {
    globalValidator = new DataValidator();
  }
  return globalValidator;
}

/**
 * Dispose the global validator (for testing)
 */
export function disposeDataValidator(): void {
  if (globalValidator) {
    globalValidator.dispose();
    globalValidator = undefined;
  }
}

/**
 * Create validation result helper
 */
export function createValidationResult(
  filePath: string,
  dataType: DataValidationResult['dataType'],
  errors: CsvValidationError[],
  warnings: CsvValidationError[]
): DataValidationResult {
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    filePath,
    dataType,
  };
}
