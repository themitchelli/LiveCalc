import * as vscode from 'vscode';
import { ResultsState } from '../ui/results-state';
import { logger } from '../logging/logger';

/**
 * Summary of assumption versions used in a run
 */
export interface AssumptionVersionSummary {
  /** Assumption name (e.g., 'Mortality') */
  name: string;
  /** Source reference */
  source: string;
  /** Version used (for AM references) */
  version?: string;
  /** Resolved version (if different from requested, e.g., 'latest' → 'v2.1') */
  resolvedVersion?: string;
  /** Whether this is a local file (vs AM reference) */
  isLocal: boolean;
  /** Approval status (for AM references) */
  approvalStatus?: 'approved' | 'draft' | 'pending' | 'rejected';
}

/**
 * A summary entry for run history (stored for display)
 * Contains just enough data to display in the history list
 */
export interface RunHistoryEntry {
  runId: string;
  timestamp: Date;
  trigger: 'manual' | 'auto';
  triggerFile: string | null;
  executionTimeMs: number;
  meanNpv: number;
  scenarioCount: number;
  policyCount: number;
  /** Summary of assumption versions used in this run */
  assumptionVersions?: AssumptionVersionSummary[];
}

/**
 * Full run history item including complete results
 * Used when viewing a specific historical run
 */
export interface RunHistoryItem {
  entry: RunHistoryEntry;
  results: ResultsState;
}

/**
 * Storage key for workspace state
 */
const STORAGE_KEY_RUN_HISTORY = 'livecalc.runHistory';

/**
 * RunHistoryManager maintains a list of recent run results
 * for viewing, comparison, and export
 */
export class RunHistoryManager implements vscode.Disposable {
  private static instance: RunHistoryManager | undefined;
  private context: vscode.ExtensionContext;
  private history: RunHistoryItem[] = [];
  private maxSize: number;

  /**
   * Event emitter for history changes
   */
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  /**
   * Get or create the singleton instance
   */
  public static getInstance(context: vscode.ExtensionContext): RunHistoryManager {
    if (!RunHistoryManager.instance) {
      RunHistoryManager.instance = new RunHistoryManager(context);
    }
    return RunHistoryManager.instance;
  }

  /**
   * Get existing instance (without creating)
   */
  public static getExistingInstance(): RunHistoryManager | undefined {
    return RunHistoryManager.instance;
  }

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.maxSize = this.getMaxSizeFromConfig();
    // History is only kept in memory during session - cleared on extension reload
    // This matches the acceptance criteria: "History cleared on extension reload"
    this.history = [];
    logger.debug('RunHistoryManager initialized');
  }

  /**
   * Get max history size from VS Code configuration
   */
  private getMaxSizeFromConfig(): number {
    const config = vscode.workspace.getConfiguration('livecalc');
    const size = config.get<number>('historySize', 10);
    return Math.min(Math.max(size, 1), 50); // Clamp between 1 and 50
  }

  /**
   * Add a run to history
   */
  public addRun(
    results: ResultsState,
    trigger: 'manual' | 'auto',
    triggerFile: string | null = null
  ): void {
    // Update max size in case config changed
    this.maxSize = this.getMaxSizeFromConfig();

    // Extract assumption version summary
    const assumptionVersions: AssumptionVersionSummary[] = results.assumptions.map((a) => ({
      name: a.name,
      source: a.source,
      version: a.version,
      resolvedVersion: a.resolvedVersion,
      isLocal: a.isLocal,
      approvalStatus: a.approvalStatus,
    }));

    const entry: RunHistoryEntry = {
      runId: results.metadata.runId,
      timestamp: results.metadata.timestamp,
      trigger,
      triggerFile,
      executionTimeMs: results.executionTimeMs,
      meanNpv: results.statistics.mean,
      scenarioCount: results.metadata.scenarioCount,
      policyCount: results.metadata.policyCount,
      assumptionVersions,
    };

    const item: RunHistoryItem = {
      entry,
      results,
    };

    // Add to beginning of array (most recent first)
    this.history.unshift(item);

    // Trim to max size
    if (this.history.length > this.maxSize) {
      const removed = this.history.splice(this.maxSize);
      logger.debug(`Trimmed ${removed.length} old runs from history`);
    }

    logger.debug(`Added run ${entry.runId} to history (${this.history.length}/${this.maxSize} entries)`);
    this._onDidChange.fire();
  }

  /**
   * Get all history entries (summary only)
   */
  public getEntries(): RunHistoryEntry[] {
    return this.history.map((item) => item.entry);
  }

  /**
   * Get full results for a specific run
   */
  public getResults(runId: string): ResultsState | undefined {
    const item = this.history.find((h) => h.entry.runId === runId);
    return item?.results;
  }

  /**
   * Get a specific history item
   */
  public getItem(runId: string): RunHistoryItem | undefined {
    return this.history.find((h) => h.entry.runId === runId);
  }

  /**
   * Get the most recent run (if any)
   */
  public getMostRecent(): RunHistoryItem | undefined {
    return this.history[0];
  }

  /**
   * Get history count
   */
  public get count(): number {
    return this.history.length;
  }

  /**
   * Check if history is empty
   */
  public get isEmpty(): boolean {
    return this.history.length === 0;
  }

  /**
   * Clear all history
   */
  public clear(): void {
    this.history = [];
    logger.info('Run history cleared');
    this._onDidChange.fire();
  }

  /**
   * Export history to CSV format
   */
  public exportToCsv(): string {
    const lines: string[] = [];

    // Header
    lines.push('Run ID,Timestamp,Trigger,Trigger File,Execution Time (ms),Mean NPV,Scenario Count,Policy Count');

    // Data rows
    for (const item of this.history) {
      const entry = item.entry;
      lines.push([
        entry.runId,
        entry.timestamp.toISOString(),
        entry.trigger,
        entry.triggerFile || '',
        entry.executionTimeMs.toString(),
        entry.meanNpv.toString(),
        entry.scenarioCount.toString(),
        entry.policyCount.toString(),
      ].join(','));
    }

    return lines.join('\n');
  }

  /**
   * Export history with full statistics to CSV
   */
  public exportDetailedToCsv(): string {
    const lines: string[] = [];

    // Header
    lines.push([
      'Run ID',
      'Timestamp',
      'Trigger',
      'Trigger File',
      'Execution Time (ms)',
      'Policy Count',
      'Scenario Count',
      'Mean NPV',
      'Std Dev',
      'CTE 95',
      'P50',
      'P75',
      'P90',
      'P95',
      'P99',
      'Min',
      'Max',
      'Mortality Version',
      'Lapse Version',
      'Expenses Version',
    ].join(','));

    // Data rows
    for (const item of this.history) {
      const entry = item.entry;
      const stats = item.results.statistics;
      const assumptions = item.results.assumptions;

      // Extract version info for each assumption type
      const getVersionInfo = (type: string): string => {
        const assumption = assumptions.find((a) => a.type === type);
        if (!assumption) return '';
        if (assumption.isLocal) {
          return `local:${assumption.source}`;
        }
        const version = assumption.resolvedVersion || assumption.version || 'unknown';
        const status = assumption.approvalStatus && assumption.approvalStatus !== 'approved'
          ? ` [${assumption.approvalStatus}]`
          : '';
        return `${assumption.tableName || assumption.source}:${version}${status}`;
      };

      lines.push([
        entry.runId,
        entry.timestamp.toISOString(),
        entry.trigger,
        entry.triggerFile || '',
        entry.executionTimeMs.toString(),
        entry.policyCount.toString(),
        entry.scenarioCount.toString(),
        stats.mean.toString(),
        stats.stdDev.toString(),
        stats.cte95.toString(),
        stats.p50.toString(),
        stats.p75.toString(),
        stats.p90.toString(),
        stats.p95.toString(),
        stats.p99.toString(),
        stats.min.toString(),
        stats.max.toString(),
        this.escapeCsvValue(getVersionInfo('mortality')),
        this.escapeCsvValue(getVersionInfo('lapse')),
        this.escapeCsvValue(getVersionInfo('expenses')),
      ].join(','));
    }

    return lines.join('\n');
  }

  /**
   * Escape a value for CSV (wrap in quotes if contains comma, quote, or newline)
   */
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Dispose the manager
   */
  public dispose(): void {
    this._onDidChange.dispose();
    RunHistoryManager.instance = undefined;
    logger.debug('RunHistoryManager disposed');
  }
}

/**
 * Dispose the global instance
 */
export function disposeRunHistoryManager(): void {
  const instance = RunHistoryManager.getExistingInstance();
  instance?.dispose();
}
