import * as vscode from 'vscode';
import { Logger } from '../logging/logger';

export interface BreakpointState {
  nodeId: string;
  enabled: boolean;
  hitCount: number;
  condition?: string; // Future: conditional breakpoints (e.g., "scenario > 100")
}

export interface PausedState {
  isPaused: boolean;
  pausedAtNode?: string;
  busDataSnapshot?: { [key: string]: Float64Array };
  checksums?: { [key: string]: string };
  executionTime?: number;
}

export type BreakpointAction = 'step' | 'continue' | 'abort';

/**
 * BreakpointManager
 *
 * Manages breakpoints for pipeline execution debugging.
 * Persists breakpoint state in workspace settings.
 * Coordinates with PipelineOrchestrator to pause execution.
 */
export class BreakpointManager {
  private static instance: BreakpointManager | undefined;

  private breakpoints: Map<string, BreakpointState> = new Map();
  private pausedState: PausedState = { isPaused: false };
  private logger: Logger;
  private context: vscode.ExtensionContext;

  // Event emitters for communication with UI
  private readonly _onDidChangeBreakpoints = new vscode.EventEmitter<BreakpointState[]>();
  readonly onDidChangeBreakpoints = this._onDidChangeBreakpoints.event;

  private readonly _onDidPause = new vscode.EventEmitter<PausedState>();
  readonly onDidPause = this._onDidPause.event;

  private readonly _onDidResume = new vscode.EventEmitter<void>();
  readonly onDidResume = this._onDidResume.event;

  private constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.context = context;
    this.logger = logger;
    this.loadBreakpoints();
  }

  static getInstance(context?: vscode.ExtensionContext, logger?: Logger): BreakpointManager {
    if (!BreakpointManager.instance) {
      if (!context || !logger) {
        throw new Error('BreakpointManager not initialized. Call getInstance with context and logger first.');
      }
      BreakpointManager.instance = new BreakpointManager(context, logger);
    }
    return BreakpointManager.instance;
  }

  static getExistingInstance(): BreakpointManager | undefined {
    return BreakpointManager.instance;
  }

  static disposeInstance(): void {
    if (BreakpointManager.instance) {
      BreakpointManager.instance._onDidChangeBreakpoints.dispose();
      BreakpointManager.instance._onDidPause.dispose();
      BreakpointManager.instance._onDidResume.dispose();
      BreakpointManager.instance = undefined;
    }
  }

  /**
   * Load breakpoints from workspace settings
   */
  private loadBreakpoints(): void {
    const stored = this.context.workspaceState.get<{ nodeId: string; enabled: boolean }[]>('livecalc.pipeline.breakpoints', []);
    this.breakpoints.clear();

    for (const bp of stored) {
      this.breakpoints.set(bp.nodeId, {
        nodeId: bp.nodeId,
        enabled: bp.enabled,
        hitCount: 0,
      });
    }

    this.logger.debug(`Loaded ${this.breakpoints.size} breakpoints from workspace state`);
  }

  /**
   * Save breakpoints to workspace settings
   */
  private async saveBreakpoints(): Promise<void> {
    const toStore = Array.from(this.breakpoints.values()).map(bp => ({
      nodeId: bp.nodeId,
      enabled: bp.enabled,
    }));

    await this.context.workspaceState.update('livecalc.pipeline.breakpoints', toStore);
    this.logger.debug(`Saved ${toStore.length} breakpoints to workspace state`);
  }

  /**
   * Toggle breakpoint on a node
   */
  async toggleBreakpoint(nodeId: string): Promise<void> {
    const existing = this.breakpoints.get(nodeId);

    if (existing) {
      // Remove breakpoint
      this.breakpoints.delete(nodeId);
      this.logger.info(`Removed breakpoint on node: ${nodeId}`);
    } else {
      // Add breakpoint
      this.breakpoints.set(nodeId, {
        nodeId,
        enabled: true,
        hitCount: 0,
      });
      this.logger.info(`Added breakpoint on node: ${nodeId}`);
    }

    await this.saveBreakpoints();
    this._onDidChangeBreakpoints.fire(this.getAllBreakpoints());
  }

  /**
   * Enable or disable a breakpoint without removing it
   */
  async setBreakpointEnabled(nodeId: string, enabled: boolean): Promise<void> {
    const bp = this.breakpoints.get(nodeId);
    if (bp) {
      bp.enabled = enabled;
      await this.saveBreakpoints();
      this._onDidChangeBreakpoints.fire(this.getAllBreakpoints());
      this.logger.debug(`${enabled ? 'Enabled' : 'Disabled'} breakpoint on node: ${nodeId}`);
    }
  }

  /**
   * Clear all breakpoints
   */
  async clearAllBreakpoints(): Promise<void> {
    this.breakpoints.clear();
    await this.saveBreakpoints();
    this._onDidChangeBreakpoints.fire([]);
    this.logger.info('Cleared all breakpoints');
  }

  /**
   * Check if execution should pause at this node
   */
  shouldPauseAt(nodeId: string): boolean {
    const bp = this.breakpoints.get(nodeId);
    return bp !== undefined && bp.enabled;
  }

  /**
   * Pause execution at a node
   * Called by orchestrator when breakpoint is hit
   */
  async pauseAt(nodeId: string, busDataSnapshot: { [key: string]: Float64Array }, checksums: { [key: string]: string }): Promise<void> {
    const bp = this.breakpoints.get(nodeId);
    if (bp) {
      bp.hitCount++;
    }

    this.pausedState = {
      isPaused: true,
      pausedAtNode: nodeId,
      busDataSnapshot,
      checksums,
      executionTime: Date.now(),
    };

    this.logger.info(`Paused at node: ${nodeId}`);
    this._onDidPause.fire(this.pausedState);
  }

  /**
   * Get current paused state
   */
  getPausedState(): PausedState {
    return { ...this.pausedState };
  }

  /**
   * Check if currently paused
   */
  isPaused(): boolean {
    return this.pausedState.isPaused;
  }

  /**
   * Resume execution (continue to next breakpoint or completion)
   */
  async resume(): Promise<void> {
    if (!this.pausedState.isPaused) {
      return;
    }

    const nodeId = this.pausedState.pausedAtNode;
    this.pausedState = { isPaused: false };

    this.logger.info(`Resumed from node: ${nodeId}`);
    this._onDidResume.fire();
  }

  /**
   * Step to next node (pause immediately after next node completes)
   */
  async step(): Promise<void> {
    if (!this.pausedState.isPaused) {
      return;
    }

    this.logger.info('Stepping to next node');
    // Resume with step flag - orchestrator will pause after next node
    this._onDidResume.fire();
  }

  /**
   * Abort pipeline execution
   */
  async abort(): Promise<void> {
    if (!this.pausedState.isPaused) {
      return;
    }

    this.pausedState = { isPaused: false };
    this.logger.info('Aborted pipeline execution from paused state');
    this._onDidResume.fire();
  }

  /**
   * Get all breakpoints
   */
  getAllBreakpoints(): BreakpointState[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * Get breakpoint for specific node
   */
  getBreakpoint(nodeId: string): BreakpointState | undefined {
    return this.breakpoints.get(nodeId);
  }

  /**
   * Check if node has breakpoint
   */
  hasBreakpoint(nodeId: string): boolean {
    return this.breakpoints.has(nodeId);
  }

  /**
   * Import breakpoints from config
   * Used when loading a project with breakpoints in livecalc.config.json
   */
  async importFromConfig(nodeIds: string[]): Promise<void> {
    for (const nodeId of nodeIds) {
      if (!this.breakpoints.has(nodeId)) {
        this.breakpoints.set(nodeId, {
          nodeId,
          enabled: true,
          hitCount: 0,
        });
      }
    }

    await this.saveBreakpoints();
    this._onDidChangeBreakpoints.fire(this.getAllBreakpoints());
    this.logger.info(`Imported ${nodeIds.length} breakpoints from config`);
  }

  /**
   * Export breakpoints to config format
   */
  exportToConfig(): string[] {
    return Array.from(this.breakpoints.values())
      .filter(bp => bp.enabled)
      .map(bp => bp.nodeId);
  }

  dispose(): void {
    this._onDidChangeBreakpoints.dispose();
    this._onDidPause.dispose();
    this._onDidResume.dispose();
  }
}
