import * as vscode from 'vscode';
import { LiveCalcConfig } from '../types';
import { logger } from '../logging/logger';

/**
 * Validation error with location information
 */
export interface ValidationError {
  message: string;
  path: string;
  severity: vscode.DiagnosticSeverity;
  line?: number;
  column?: number;
}

/**
 * Config validator that reports errors to VS Code Problems panel
 */
export class ConfigValidator implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('livecalc');
  }

  /**
   * Validate config and update Problems panel
   */
  public validateAndReport(
    config: LiveCalcConfig,
    configPath: string,
    configText: string
  ): ValidationError[] {
    const errors = this.validate(config, configText);
    this.updateDiagnostics(configPath, errors, configText);
    return errors;
  }

  /**
   * Validate config structure and values
   */
  public validate(config: LiveCalcConfig, configText?: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for unsupported "extends" field (future feature)
    if ((config as { extends?: string }).extends) {
      errors.push({
        message: 'Config inheritance ("extends") is not yet implemented. This field will be ignored.',
        path: 'extends',
        severity: vscode.DiagnosticSeverity.Warning
      });
    }

    // Required: model
    if (!config.model) {
      errors.push({
        message: 'Missing required field: model',
        path: 'model',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else if (typeof config.model !== 'string') {
      errors.push({
        message: 'Field "model" must be a string',
        path: 'model',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else if (!config.model.endsWith('.mga')) {
      errors.push({
        message: 'Model file should have .mga extension',
        path: 'model',
        severity: vscode.DiagnosticSeverity.Warning
      });
    }

    // Required: assumptions
    if (!config.assumptions) {
      errors.push({
        message: 'Missing required field: assumptions',
        path: 'assumptions',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else {
      this.validateAssumptions(config.assumptions, errors);
    }

    // Required: scenarios
    if (!config.scenarios) {
      errors.push({
        message: 'Missing required field: scenarios',
        path: 'scenarios',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else {
      this.validateScenarios(config.scenarios, errors);
    }

    // Optional: execution
    if (config.execution) {
      this.validateExecution(config.execution, errors);
    }

    // Optional: output
    if (config.output) {
      this.validateOutput(config.output, errors);
    }

    // Find line numbers for errors if configText provided
    if (configText) {
      this.addLineNumbers(errors, configText);
    }

    return errors;
  }

  /**
   * Validate assumptions section
   */
  private validateAssumptions(
    assumptions: LiveCalcConfig['assumptions'],
    errors: ValidationError[]
  ): void {
    if (!assumptions.mortality) {
      errors.push({
        message: 'Missing required field: assumptions.mortality',
        path: 'assumptions.mortality',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else if (!this.isValidDataSource(assumptions.mortality)) {
      errors.push({
        message: 'assumptions.mortality must use "local://" or "assumptions://" prefix',
        path: 'assumptions.mortality',
        severity: vscode.DiagnosticSeverity.Error
      });
    }

    if (!assumptions.lapse) {
      errors.push({
        message: 'Missing required field: assumptions.lapse',
        path: 'assumptions.lapse',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else if (!this.isValidDataSource(assumptions.lapse)) {
      errors.push({
        message: 'assumptions.lapse must use "local://" or "assumptions://" prefix',
        path: 'assumptions.lapse',
        severity: vscode.DiagnosticSeverity.Error
      });
    }

    if (!assumptions.expenses) {
      errors.push({
        message: 'Missing required field: assumptions.expenses',
        path: 'assumptions.expenses',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else if (!this.isValidDataSource(assumptions.expenses)) {
      errors.push({
        message: 'assumptions.expenses must use "local://" or "assumptions://" prefix',
        path: 'assumptions.expenses',
        severity: vscode.DiagnosticSeverity.Error
      });
    }
  }

  /**
   * Validate scenarios section
   */
  private validateScenarios(
    scenarios: LiveCalcConfig['scenarios'],
    errors: ValidationError[]
  ): void {
    if (typeof scenarios.count !== 'number') {
      errors.push({
        message: 'scenarios.count must be a number',
        path: 'scenarios.count',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else if (scenarios.count < 1) {
      errors.push({
        message: 'scenarios.count must be at least 1',
        path: 'scenarios.count',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else if (scenarios.count > 100000) {
      errors.push({
        message: 'scenarios.count exceeds maximum of 100,000',
        path: 'scenarios.count',
        severity: vscode.DiagnosticSeverity.Error
      });
    }

    if (typeof scenarios.seed !== 'number') {
      errors.push({
        message: 'scenarios.seed must be a number',
        path: 'scenarios.seed',
        severity: vscode.DiagnosticSeverity.Error
      });
    }

    if (!scenarios.interestRate) {
      errors.push({
        message: 'Missing required field: scenarios.interestRate',
        path: 'scenarios.interestRate',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else {
      this.validateInterestRate(scenarios.interestRate, errors);
    }
  }

  /**
   * Validate interest rate parameters
   */
  private validateInterestRate(
    interestRate: LiveCalcConfig['scenarios']['interestRate'],
    errors: ValidationError[]
  ): void {
    if (typeof interestRate.initial !== 'number') {
      errors.push({
        message: 'scenarios.interestRate.initial must be a number',
        path: 'scenarios.interestRate.initial',
        severity: vscode.DiagnosticSeverity.Error
      });
    } else if (interestRate.initial < 0 || interestRate.initial > 1) {
      errors.push({
        message: 'scenarios.interestRate.initial must be between 0 and 1',
        path: 'scenarios.interestRate.initial',
        severity: vscode.DiagnosticSeverity.Error
      });
    }

    if (interestRate.drift !== undefined && typeof interestRate.drift !== 'number') {
      errors.push({
        message: 'scenarios.interestRate.drift must be a number',
        path: 'scenarios.interestRate.drift',
        severity: vscode.DiagnosticSeverity.Error
      });
    }

    if (interestRate.volatility !== undefined) {
      if (typeof interestRate.volatility !== 'number') {
        errors.push({
          message: 'scenarios.interestRate.volatility must be a number',
          path: 'scenarios.interestRate.volatility',
          severity: vscode.DiagnosticSeverity.Error
        });
      } else if (interestRate.volatility < 0) {
        errors.push({
          message: 'scenarios.interestRate.volatility cannot be negative',
          path: 'scenarios.interestRate.volatility',
          severity: vscode.DiagnosticSeverity.Error
        });
      }
    }

    if (interestRate.minRate !== undefined && interestRate.maxRate !== undefined) {
      if (interestRate.minRate > interestRate.maxRate) {
        errors.push({
          message: 'scenarios.interestRate.minRate cannot exceed maxRate',
          path: 'scenarios.interestRate.minRate',
          severity: vscode.DiagnosticSeverity.Error
        });
      }
    }
  }

  /**
   * Validate execution settings
   */
  private validateExecution(
    execution: LiveCalcConfig['execution'],
    errors: ValidationError[]
  ): void {
    if (!execution) return;

    if (execution.timeout !== undefined) {
      if (typeof execution.timeout !== 'number') {
        errors.push({
          message: 'execution.timeout must be a number',
          path: 'execution.timeout',
          severity: vscode.DiagnosticSeverity.Error
        });
      } else if (execution.timeout < 1 || execution.timeout > 3600) {
        errors.push({
          message: 'execution.timeout must be between 1 and 3600 seconds',
          path: 'execution.timeout',
          severity: vscode.DiagnosticSeverity.Error
        });
      }
    }

    if (execution.maxPolicies !== undefined) {
      if (typeof execution.maxPolicies !== 'number') {
        errors.push({
          message: 'execution.maxPolicies must be a number',
          path: 'execution.maxPolicies',
          severity: vscode.DiagnosticSeverity.Error
        });
      } else if (execution.maxPolicies < 1) {
        errors.push({
          message: 'execution.maxPolicies must be at least 1',
          path: 'execution.maxPolicies',
          severity: vscode.DiagnosticSeverity.Error
        });
      }
    }
  }

  /**
   * Validate output settings
   */
  private validateOutput(
    output: LiveCalcConfig['output'],
    errors: ValidationError[]
  ): void {
    if (!output) return;

    if (output.percentiles !== undefined) {
      if (!Array.isArray(output.percentiles)) {
        errors.push({
          message: 'output.percentiles must be an array',
          path: 'output.percentiles',
          severity: vscode.DiagnosticSeverity.Error
        });
      } else {
        for (let i = 0; i < output.percentiles.length; i++) {
          const p = output.percentiles[i];
          if (typeof p !== 'number' || p < 1 || p > 99) {
            errors.push({
              message: `output.percentiles[${i}] must be an integer between 1 and 99`,
              path: `output.percentiles[${i}]`,
              severity: vscode.DiagnosticSeverity.Error
            });
          }
        }
      }
    }
  }

  /**
   * Check if a data source is valid (local:// or assumptions://)
   */
  private isValidDataSource(source: string): boolean {
    return source.startsWith('local://') || source.startsWith('assumptions://');
  }

  /**
   * Add line numbers to validation errors by searching for paths in config text
   */
  private addLineNumbers(errors: ValidationError[], configText: string): void {
    const lines = configText.split('\n');

    for (const error of errors) {
      // Convert path to search pattern (e.g., "assumptions.mortality" -> "mortality")
      const pathParts = error.path.split('.');
      const searchKey = pathParts[pathParts.length - 1];

      // Handle array index in path (e.g., "output.percentiles[0]")
      const keyWithoutIndex = searchKey.replace(/\[\d+\]$/, '');

      // Search for the key in the config text
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for "key": pattern
        const pattern = new RegExp(`"${keyWithoutIndex}"\\s*:`);
        if (pattern.test(line)) {
          error.line = i;
          error.column = line.indexOf(`"${keyWithoutIndex}"`);
          break;
        }
      }
    }
  }

  /**
   * Update VS Code diagnostics collection
   */
  private updateDiagnostics(
    configPath: string,
    errors: ValidationError[],
    configText: string
  ): void {
    const uri = vscode.Uri.file(configPath);
    const diagnostics: vscode.Diagnostic[] = [];

    for (const error of errors) {
      const line = error.line ?? 0;
      const column = error.column ?? 0;

      // Create range for the diagnostic
      const range = new vscode.Range(
        new vscode.Position(line, column),
        new vscode.Position(line, column + error.path.length + 3) // Include key and colon
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        error.message,
        error.severity
      );
      diagnostic.source = 'LiveCalc';
      diagnostic.code = error.path;
      diagnostics.push(diagnostic);
    }

    this.diagnosticCollection.set(uri, diagnostics);
    logger.debug(`Updated diagnostics for ${configPath}: ${errors.length} issues`);
  }

  /**
   * Clear diagnostics for a file
   */
  public clearDiagnostics(configPath: string): void {
    const uri = vscode.Uri.file(configPath);
    this.diagnosticCollection.delete(uri);
  }

  /**
   * Clear all diagnostics
   */
  public clearAllDiagnostics(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * Get all current validation errors
   */
  public hasErrors(configPath: string): boolean {
    const uri = vscode.Uri.file(configPath);
    const diagnostics = this.diagnosticCollection.get(uri);
    if (!diagnostics) {
      return false;
    }
    return diagnostics.some(d => d.severity === vscode.DiagnosticSeverity.Error);
  }

  public dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
