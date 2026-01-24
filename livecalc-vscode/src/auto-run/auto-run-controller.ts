import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logging/logger';
import { FileWatcher, FileChangeEvent } from './file-watcher';
import { Debouncer } from './debouncer';
import { ConfigLoader } from '../config/config-loader';
import { StatusBar } from '../ui/status-bar';
import { LiveCalcConfig } from '../types';

/**
 * State keys for workspace state persistence
 */
const STATE_KEYS = {
  AUTO_RUN_ENABLED: 'livecalc.autoRunEnabled',
};

/**
 * Trigger information for the last auto-run
 */
export interface AutoRunTrigger {
  files: string[];
  types: ('changed' | 'created' | 'deleted')[];
  timestamp: Date;
}

/**
 * Auto-run controller manages automatic re-execution on file save
 * Coordinates file watching, debouncing, and run cancellation
 */
export class AutoRunController implements vscode.Disposable {
  private enabled: boolean = true;
  private fileWatcher: FileWatcher;
  private debouncer: Debouncer;
  private context: vscode.ExtensionContext;
  private configLoader: ConfigLoader;
  private statusBar: StatusBar;
  private currentCancellation: vscode.CancellationTokenSource | undefined;
  private runCommand: (() => Promise<void>) | undefined;
  private lastTrigger: AutoRunTrigger | undefined;
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private isRunning: boolean = false;
  private onAutoRunTriggeredEmitter = new vscode.EventEmitter<AutoRunTrigger>();

  /**
   * Event fired when auto-run is triggered
   */
  public readonly onAutoRunTriggered = this.onAutoRunTriggeredEmitter.event;

  constructor(
    context: vscode.ExtensionContext,
    configLoader: ConfigLoader,
    statusBar: StatusBar
  ) {
    this.context = context;
    this.configLoader = configLoader;
    this.statusBar = statusBar;

    // Create file watcher
    this.fileWatcher = new FileWatcher();
    this.fileWatcher.onFileChange((event) => this.handleFileChange(event));

    // Create debouncer with configured delay
    const debounceMs = this.getDebounceDelay();
    this.debouncer = new Debouncer(debounceMs);
    this.debouncer.setCallback((files) => this.executeAutoRun(files));

    // Restore enabled state from workspace state
    this.enabled = this.context.workspaceState.get(STATE_KEYS.AUTO_RUN_ENABLED, true);

    // Also check if VS Code setting overrides
    const settingEnabled = vscode.workspace.getConfiguration('livecalc').get('autoRunOnSave', true);
    if (!settingEnabled) {
      this.enabled = false;
    }

    // Listen for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('livecalc.autoRunOnSave')) {
          const newEnabled = vscode.workspace.getConfiguration('livecalc').get('autoRunOnSave', true);
          if (!newEnabled && this.enabled) {
            this.setEnabled(false);
          }
        }
        if (event.affectsConfiguration('livecalc.autoRunDebounceMs')) {
          const newDebounce = this.getDebounceDelay();
          this.debouncer.setDelayMs(newDebounce);
        }
        if (event.affectsConfiguration('livecalc.watchExclude')) {
          const excludes = vscode.workspace.getConfiguration('livecalc').get<string[]>('watchExclude', []);
          this.fileWatcher.setCustomExcludes(excludes);
        }
      })
    );

    // Set initial exclude patterns
    const excludes = vscode.workspace.getConfiguration('livecalc').get<string[]>('watchExclude', []);
    this.fileWatcher.setCustomExcludes(excludes);

    // Update status bar
    this.updateStatusBar();

    logger.info(`Auto-run controller initialized (enabled: ${this.enabled})`);
  }

  /**
   * Get the debounce delay from configuration
   */
  private getDebounceDelay(): number {
    return vscode.workspace.getConfiguration('livecalc').get('autoRunDebounceMs', 500);
  }

  /**
   * Set the run command callback
   */
  public setRunCommand(command: () => Promise<void>): void {
    this.runCommand = command;
  }

  /**
   * Update the config and refresh file watchers
   */
  public updateConfig(config: LiveCalcConfig, configDir: string): void {
    this.fileWatcher.updateConfig(config, configDir);
    logger.debug('Auto-run config updated');
  }

  /**
   * Check if auto-run is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable auto-run
   */
  public async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;

    // Persist to workspace state
    await this.context.workspaceState.update(STATE_KEYS.AUTO_RUN_ENABLED, enabled);

    // Update status bar
    this.updateStatusBar();

    logger.info(`Auto-run ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Toggle auto-run on/off
   */
  public async toggle(): Promise<void> {
    await this.setEnabled(!this.enabled);
  }

  /**
   * Check if a run is currently in progress
   */
  public isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the last trigger information
   */
  public getLastTrigger(): AutoRunTrigger | undefined {
    return this.lastTrigger;
  }

  /**
   * Get count of pending changes (during debounce)
   */
  public getPendingChangeCount(): number {
    return this.debouncer.getPendingCount();
  }

  /**
   * Cancel any in-progress run
   */
  public cancelCurrentRun(): void {
    if (this.currentCancellation) {
      logger.info('Cancelling current run for new auto-run');
      this.currentCancellation.cancel();
      this.currentCancellation.dispose();
      this.currentCancellation = undefined;
    }
  }

  /**
   * Handle a file change event
   */
  private handleFileChange(event: FileChangeEvent): void {
    // Skip if auto-run is disabled
    if (!this.enabled) {
      logger.debug(`Auto-run disabled, ignoring file change: ${event.fileName}`);
      return;
    }

    // Check if file is relevant
    if (!this.fileWatcher.isRelevantFile(event.uri)) {
      logger.debug(`Ignoring irrelevant file: ${event.fileName}`);
      return;
    }

    // Store the change info
    this.pendingChanges.set(event.uri.fsPath, event);

    // Debounce the run
    this.debouncer.debounce(event.uri.fsPath);

    // Update status bar to show pending changes
    this.updateStatusBar();
  }

  /**
   * Execute auto-run after debounce period
   */
  private async executeAutoRun(files: string[]): Promise<void> {
    if (!this.runCommand) {
      logger.warn('No run command configured for auto-run');
      return;
    }

    // Build trigger info from pending changes
    const types: ('changed' | 'created' | 'deleted')[] = [];
    for (const file of files) {
      const change = this.pendingChanges.get(file);
      if (change) {
        types.push(change.type);
      }
    }

    // Create trigger info
    this.lastTrigger = {
      files: files.map((f) => path.basename(f)),
      types,
      timestamp: new Date(),
    };

    // Clear pending changes
    this.pendingChanges.clear();

    // Emit event
    this.onAutoRunTriggeredEmitter.fire(this.lastTrigger);

    // Log trigger
    const fileNames = this.lastTrigger.files.join(', ');
    logger.info(`Auto-run triggered by: ${fileNames}`);

    // Cancel any in-progress run
    this.cancelCurrentRun();

    // Create new cancellation token
    this.currentCancellation = new vscode.CancellationTokenSource();

    // Mark as running
    this.isRunning = true;
    this.updateStatusBar();

    try {
      await this.runCommand();
    } catch (error) {
      // Errors are handled by the run command itself
      logger.debug('Auto-run completed with error (handled by run command)');
    } finally {
      this.isRunning = false;
      this.currentCancellation?.dispose();
      this.currentCancellation = undefined;
      this.updateStatusBar();
    }
  }

  /**
   * Get the cancellation token for the current run
   */
  public getCancellationToken(): vscode.CancellationToken | undefined {
    return this.currentCancellation?.token;
  }

  /**
   * Update status bar to reflect auto-run state
   */
  private updateStatusBar(): void {
    // Status bar updates handled by StatusBarAutoRunMixin
    // This is a placeholder for now
  }

  public dispose(): void {
    this.debouncer.dispose();
    this.fileWatcher.dispose();
    this.currentCancellation?.dispose();
    this.onAutoRunTriggeredEmitter.dispose();
  }
}
