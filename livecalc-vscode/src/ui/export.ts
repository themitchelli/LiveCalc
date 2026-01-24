import * as vscode from 'vscode';
import { ResultsState, StatisticsData } from './results-state';
import { logger } from '../logging/logger';

/**
 * Export format types
 */
export type ExportFormat = 'csv' | 'json' | 'clipboard';

/**
 * Export options
 */
export interface ExportOptions {
  /** Include scenario NPVs in export (default: true) */
  includeScenarios?: boolean;
  /** Show progress for large exports (default: true) */
  showProgress?: boolean;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  success: boolean;
  message: string;
  /** File path for file exports, undefined for clipboard */
  filePath?: string;
}

/**
 * Threshold for showing progress during export (100K scenarios)
 */
const LARGE_EXPORT_THRESHOLD = 100_000;

/**
 * Export results to various formats
 */
export class ResultsExporter {
  /**
   * Export results in the specified format
   */
  public static async export(
    results: ResultsState,
    format: ExportFormat,
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    const { includeScenarios = true, showProgress = true } = options;

    logger.debug(`Exporting results as ${format}`);

    try {
      switch (format) {
        case 'csv':
          return await this.exportToCsv(results, includeScenarios, showProgress);
        case 'json':
          return await this.exportToJson(results, includeScenarios, showProgress);
        case 'clipboard':
          return await this.exportToClipboard(results);
        default:
          throw new Error(`Unknown export format: ${format}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Export failed: ${message}`);
      return { success: false, message: `Export failed: ${message}` };
    }
  }

  /**
   * Export results to CSV file
   */
  private static async exportToCsv(
    results: ResultsState,
    includeScenarios: boolean,
    showProgress: boolean
  ): Promise<ExportResult> {
    // Generate default filename
    const timestamp = this.formatTimestampForFilename(results.metadata.timestamp);
    const defaultFileName = `livecalc-results-${timestamp}.csv`;

    // Show save dialog
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultFileName),
      filters: { 'CSV Files': ['csv'] },
      title: 'Export Results as CSV',
    });

    if (!uri) {
      return { success: false, message: 'Export cancelled' };
    }

    // Build CSV content
    const isLargeExport = includeScenarios && results.distribution.length > LARGE_EXPORT_THRESHOLD;

    let csvContent: string;

    if (isLargeExport && showProgress) {
      // Show progress for large exports
      csvContent = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Exporting results...',
          cancellable: true,
        },
        async (progress, token) => {
          return this.buildCsvContent(results, includeScenarios, (percent) => {
            progress.report({ message: `${percent}%`, increment: percent });
          }, token);
        }
      );
    } else {
      csvContent = this.buildCsvContent(results, includeScenarios);
    }

    // Write file
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(uri, encoder.encode(csvContent));

    logger.info(`Exported results to CSV: ${uri.fsPath}`);
    return {
      success: true,
      message: `Results exported to ${uri.fsPath}`,
      filePath: uri.fsPath,
    };
  }

  /**
   * Build CSV content from results
   */
  private static buildCsvContent(
    results: ResultsState,
    includeScenarios: boolean,
    progressCallback?: (percent: number) => void,
    cancellationToken?: vscode.CancellationToken
  ): string {
    const lines: string[] = [];

    // Summary statistics section
    lines.push('# LiveCalc Results Export');
    lines.push(`# Run ID: ${results.metadata.runId}`);
    lines.push(`# Timestamp: ${new Date(results.metadata.timestamp).toISOString()}`);
    lines.push(`# Model: ${results.metadata.modelFile}`);
    lines.push(`# Policies: ${results.metadata.policyCount}`);
    lines.push(`# Scenarios: ${results.metadata.scenarioCount}`);
    lines.push(`# Seed: ${results.metadata.seed}`);
    lines.push('');
    lines.push('# Statistics');
    lines.push('statistic,value');
    lines.push(`mean,${results.statistics.mean}`);
    lines.push(`std_dev,${results.statistics.stdDev}`);
    lines.push(`cte_95,${results.statistics.cte95}`);
    lines.push(`p50,${results.statistics.p50}`);
    lines.push(`p75,${results.statistics.p75}`);
    lines.push(`p90,${results.statistics.p90}`);
    lines.push(`p95,${results.statistics.p95}`);
    lines.push(`p99,${results.statistics.p99}`);
    lines.push(`min,${results.statistics.min}`);
    lines.push(`max,${results.statistics.max}`);
    lines.push('');

    // Assumptions section
    lines.push('# Assumptions');
    lines.push('name,type,source,multiplier,hash');
    for (const assumption of results.assumptions) {
      const multiplier = assumption.multiplier !== undefined ? assumption.multiplier : 1;
      const hash = assumption.hash || '';
      lines.push(`${this.escapeCsvValue(assumption.name)},${assumption.type},${this.escapeCsvValue(assumption.source)},${multiplier},${hash}`);
    }
    lines.push('');

    // Scenario NPVs section
    if (includeScenarios && results.distribution.length > 0) {
      lines.push('# Scenario NPVs');
      lines.push('scenario_id,npv');

      const distribution = results.distribution;
      const chunkSize = 10000;
      let lastReportedPercent = 0;

      for (let i = 0; i < distribution.length; i++) {
        if (cancellationToken?.isCancellationRequested) {
          throw new Error('Export cancelled');
        }

        lines.push(`${i + 1},${distribution[i]}`);

        // Report progress for large exports
        if (progressCallback && i % chunkSize === 0) {
          const percent = Math.floor((i / distribution.length) * 100);
          if (percent !== lastReportedPercent) {
            progressCallback(percent);
            lastReportedPercent = percent;
          }
        }
      }

      if (progressCallback) {
        progressCallback(100);
      }
    }

    return lines.join('\n');
  }

  /**
   * Export results to JSON file
   */
  private static async exportToJson(
    results: ResultsState,
    includeScenarios: boolean,
    showProgress: boolean
  ): Promise<ExportResult> {
    // Generate default filename
    const timestamp = this.formatTimestampForFilename(results.metadata.timestamp);
    const defaultFileName = `livecalc-results-${timestamp}.json`;

    // Show save dialog
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultFileName),
      filters: { 'JSON Files': ['json'] },
      title: 'Export Results as JSON',
    });

    if (!uri) {
      return { success: false, message: 'Export cancelled' };
    }

    // Build JSON content
    const isLargeExport = includeScenarios && results.distribution.length > LARGE_EXPORT_THRESHOLD;

    let jsonContent: string;

    if (isLargeExport && showProgress) {
      // Show progress for large exports
      jsonContent = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Exporting results...',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Building JSON...' });
          return this.buildJsonContent(results, includeScenarios);
        }
      );
    } else {
      jsonContent = this.buildJsonContent(results, includeScenarios);
    }

    // Write file
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(uri, encoder.encode(jsonContent));

    logger.info(`Exported results to JSON: ${uri.fsPath}`);
    return {
      success: true,
      message: `Results exported to ${uri.fsPath}`,
      filePath: uri.fsPath,
    };
  }

  /**
   * Build JSON content from results
   */
  private static buildJsonContent(results: ResultsState, includeScenarios: boolean): string {
    const exportData = {
      metadata: {
        runId: results.metadata.runId,
        timestamp: new Date(results.metadata.timestamp).toISOString(),
        modelFile: results.metadata.modelFile,
        policyFile: results.metadata.policyFile,
        policyCount: results.metadata.policyCount,
        scenarioCount: results.metadata.scenarioCount,
        seed: results.metadata.seed,
        executionMode: results.metadata.executionMode,
        executionTimeMs: results.executionTimeMs,
        interestRateParams: results.metadata.interestRate,
        jobId: results.metadata.jobId,
        cost: results.metadata.cost,
      },
      statistics: {
        mean: results.statistics.mean,
        stdDev: results.statistics.stdDev,
        cte95: results.statistics.cte95,
        percentiles: {
          p50: results.statistics.p50,
          p75: results.statistics.p75,
          p90: results.statistics.p90,
          p95: results.statistics.p95,
          p99: results.statistics.p99,
        },
        min: results.statistics.min,
        max: results.statistics.max,
      },
      assumptions: results.assumptions.map((a) => ({
        name: a.name,
        type: a.type,
        source: a.source,
        isLocal: a.isLocal,
        version: a.version,
        multiplier: a.multiplier,
        hash: a.hash,
      })),
      scenarios: includeScenarios ? results.distribution : undefined,
      warnings: results.warnings,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export summary statistics to clipboard
   */
  private static async exportToClipboard(results: ResultsState): Promise<ExportResult> {
    const text = this.buildClipboardText(results);
    await vscode.env.clipboard.writeText(text);

    logger.info('Copied results summary to clipboard');
    return {
      success: true,
      message: 'Results summary copied to clipboard',
    };
  }

  /**
   * Build text summary for clipboard
   */
  private static buildClipboardText(results: ResultsState): string {
    const lines: string[] = [];

    lines.push('LiveCalc Results Summary');
    lines.push('========================');
    lines.push('');
    lines.push(`Run ID: ${results.metadata.runId}`);
    lines.push(`Timestamp: ${new Date(results.metadata.timestamp).toLocaleString()}`);
    lines.push(`Model: ${results.metadata.modelFile}`);
    lines.push('');
    lines.push(`Policies: ${results.metadata.policyCount.toLocaleString()}`);
    lines.push(`Scenarios: ${results.metadata.scenarioCount.toLocaleString()}`);
    lines.push(`Execution Time: ${this.formatDuration(results.executionTimeMs)}`);
    lines.push('');
    lines.push('Statistics');
    lines.push('----------');
    lines.push(`Mean NPV:   ${this.formatNumber(results.statistics.mean)}`);
    lines.push(`Std Dev:    ${this.formatNumber(results.statistics.stdDev)}`);
    lines.push(`CTE 95:     ${this.formatNumber(results.statistics.cte95)}`);
    lines.push('');
    lines.push('Percentiles');
    lines.push('-----------');
    lines.push(`P50:   ${this.formatNumber(results.statistics.p50)}`);
    lines.push(`P75:   ${this.formatNumber(results.statistics.p75)}`);
    lines.push(`P90:   ${this.formatNumber(results.statistics.p90)}`);
    lines.push(`P95:   ${this.formatNumber(results.statistics.p95)}`);
    lines.push(`P99:   ${this.formatNumber(results.statistics.p99)}`);
    lines.push('');
    lines.push(`Min:   ${this.formatNumber(results.statistics.min)}`);
    lines.push(`Max:   ${this.formatNumber(results.statistics.max)}`);

    if (results.assumptions && results.assumptions.length > 0) {
      lines.push('');
      lines.push('Assumptions');
      lines.push('-----------');
      for (const a of results.assumptions) {
        const multiplierStr = a.multiplier && a.multiplier !== 1 ? ` (${a.multiplier}x)` : '';
        lines.push(`${a.name}: ${a.source}${multiplierStr}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format timestamp for filename (YYYY-MM-DD format)
   */
  private static formatTimestampForFilename(timestamp: Date | string): string {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Format number with thousands separators
   */
  private static formatNumber(value: number): string {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Format duration in human-readable form
   */
  private static formatDuration(ms: number): string {
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

  /**
   * Escape a value for CSV (wrap in quotes if contains comma, quote, or newline)
   */
  private static escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
