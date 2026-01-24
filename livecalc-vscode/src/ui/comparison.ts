import * as vscode from 'vscode';
import { ResultsState, ComparisonState, StatisticDelta, calculateComparison } from './results-state';
import { logger } from '../logging/logger';

/**
 * Storage keys for workspace state
 */
const STORAGE_KEY_PREVIOUS_RESULTS = 'livecalc.previousResults';
const STORAGE_KEY_PINNED_BASELINE = 'livecalc.pinnedBaseline';

/**
 * Comparison manager for persisting and managing comparison state
 * Uses VS Code workspaceState for persistence across extension reloads
 */
export class ComparisonManager implements vscode.Disposable {
  private static instance: ComparisonManager | undefined;
  private context: vscode.ExtensionContext;
  private previousResults: ResultsState | null = null;
  private pinnedBaseline: ResultsState | null = null;

  /**
   * Get or create the singleton instance
   */
  public static getInstance(context: vscode.ExtensionContext): ComparisonManager {
    if (!ComparisonManager.instance) {
      ComparisonManager.instance = new ComparisonManager(context);
    }
    return ComparisonManager.instance;
  }

  /**
   * Get existing instance (without creating)
   */
  public static getExistingInstance(): ComparisonManager | undefined {
    return ComparisonManager.instance;
  }

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadFromStorage();
  }

  /**
   * Load comparison state from workspace storage
   */
  private loadFromStorage(): void {
    try {
      const previousJson = this.context.workspaceState.get<string>(STORAGE_KEY_PREVIOUS_RESULTS);
      const pinnedJson = this.context.workspaceState.get<string>(STORAGE_KEY_PINNED_BASELINE);

      if (previousJson) {
        this.previousResults = JSON.parse(previousJson);
        // Convert timestamp string back to Date
        if (this.previousResults?.metadata?.timestamp) {
          this.previousResults.metadata.timestamp = new Date(this.previousResults.metadata.timestamp);
        }
        logger.debug('Loaded previous results from workspace state');
      }

      if (pinnedJson) {
        this.pinnedBaseline = JSON.parse(pinnedJson);
        // Convert timestamp string back to Date
        if (this.pinnedBaseline?.metadata?.timestamp) {
          this.pinnedBaseline.metadata.timestamp = new Date(this.pinnedBaseline.metadata.timestamp);
        }
        logger.debug('Loaded pinned baseline from workspace state');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to load comparison state from storage: ${errorMsg}`);
      this.previousResults = null;
      this.pinnedBaseline = null;
    }
  }

  /**
   * Save comparison state to workspace storage
   */
  private async saveToStorage(): Promise<void> {
    try {
      await this.context.workspaceState.update(
        STORAGE_KEY_PREVIOUS_RESULTS,
        this.previousResults ? JSON.stringify(this.previousResults) : undefined
      );
      await this.context.workspaceState.update(
        STORAGE_KEY_PINNED_BASELINE,
        this.pinnedBaseline ? JSON.stringify(this.pinnedBaseline) : undefined
      );
      logger.debug('Saved comparison state to workspace storage');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to save comparison state to storage: ${errorMsg}`);
    }
  }

  /**
   * Get the current comparison baseline
   * Returns pinned baseline if set, otherwise previous results
   */
  public getBaseline(): ResultsState | null {
    return this.pinnedBaseline || this.previousResults;
  }

  /**
   * Get the pinned baseline (if any)
   */
  public getPinnedBaseline(): ResultsState | null {
    return this.pinnedBaseline;
  }

  /**
   * Get previous results (for auto-comparison)
   */
  public getPreviousResults(): ResultsState | null {
    return this.previousResults;
  }

  /**
   * Check if there is an active comparison baseline
   */
  public hasBaseline(): boolean {
    return this.pinnedBaseline !== null || this.previousResults !== null;
  }

  /**
   * Check if there is a pinned baseline
   */
  public hasPinnedBaseline(): boolean {
    return this.pinnedBaseline !== null;
  }

  /**
   * Record a new run result
   * Stores as previous results for auto-comparison
   */
  public async recordResult(results: ResultsState): Promise<void> {
    // Move current to previous (unless there's a pinned baseline)
    this.previousResults = results;
    await this.saveToStorage();
  }

  /**
   * Pin the current results as comparison baseline
   */
  public async pinBaseline(results: ResultsState): Promise<void> {
    this.pinnedBaseline = results;
    await this.saveToStorage();
    logger.info(`Pinned baseline from run ${results.metadata.runId}`);
  }

  /**
   * Clear the pinned baseline
   * Comparison will revert to using previous results
   */
  public async clearPinnedBaseline(): Promise<void> {
    this.pinnedBaseline = null;
    await this.saveToStorage();
    logger.info('Cleared pinned baseline');
  }

  /**
   * Clear all comparison state
   */
  public async clearComparison(): Promise<void> {
    this.previousResults = null;
    this.pinnedBaseline = null;
    await this.saveToStorage();
    logger.info('Cleared all comparison state');
  }

  /**
   * Calculate comparison between current results and baseline
   */
  public calculateComparison(current: ResultsState): ComparisonState | null {
    const baseline = this.getBaseline();
    if (!baseline) {
      return null;
    }
    return calculateComparison(current, baseline);
  }

  /**
   * Get comparison info for display
   */
  public getComparisonInfo(): ComparisonInfo | null {
    const baseline = this.getBaseline();
    if (!baseline) {
      return null;
    }

    return {
      isPinned: this.pinnedBaseline !== null,
      baselineRunId: baseline.metadata.runId,
      baselineTimestamp: baseline.metadata.timestamp,
      baselineDistribution: baseline.distribution,
    };
  }

  /**
   * Dispose the manager
   */
  public dispose(): void {
    ComparisonManager.instance = undefined;
  }
}

/**
 * Info about the current comparison state
 */
export interface ComparisonInfo {
  isPinned: boolean;
  baselineRunId: string;
  baselineTimestamp: Date;
  baselineDistribution: number[];
}

/**
 * Dispose the global instance
 */
export function disposeComparisonManager(): void {
  const instance = ComparisonManager.getExistingInstance();
  instance?.dispose();
}
