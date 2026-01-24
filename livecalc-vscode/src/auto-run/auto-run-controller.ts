import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logging/logger';
import { FileWatcher, FileChangeEvent } from './file-watcher';
import { Debouncer } from './debouncer';
import { ConfigLoader } from '../config/config-loader';
import { StatusBar } from '../ui/status-bar';
import { LiveCalcConfig } from '../types';
import { showNotification } from '../ui/notifications';

/**
 * State keys for workspace state persistence
 */
const STATE_KEYS = {
  AUTO_RUN_ENABLED: 'livecalc.autoRunEnabled',
};

/**
 * Pause state information
 */
export interface PauseState {
  isPaused: boolean;
  pendingChanges: Set<string>;
  pauseStartTime: Date | null;
  pauseTimeoutHandle: NodeJS.Timeout | null;
}

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
  private runCommand:
    | ((options?: {
        isAutoRun?: boolean;
        triggerInfo?: { files: string[]; types: ('changed' | 'created' | 'deleted')[] };
      }) => Promise<void>)
    | undefined;
  private lastTrigger: AutoRunTrigger | undefined;
  private cancelledForNewRun: boolean = false;
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
    this.fileWatcher.onFileDelete((event) => this.handleFileDelete(event));

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
  public setRunCommand(
    command: (options?: {
      isAutoRun?: boolean;
      triggerInfo?: { files: string[]; types: ('changed' | 'created' | 'deleted')[] };
    }) => Promise<void>
  ): void {
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
   * @param forNewRun - If true, indicates cancellation is for a new auto-run
   */
  public cancelCurrentRun(forNewRun: boolean = false): void {
    if (this.currentCancellation) {
      this.cancelledForNewRun = forNewRun;
      logger.info(`Cancelling current run${forNewRun ? ' for new auto-run' : ''}`);
      this.currentCancellation.cancel();
      this.currentCancellation.dispose();
      this.currentCancellation = undefined;
    }
  }

  /**
   * Check if the last cancellation was for a new run starting
   */
  public wasCancelledForNewRun(): boolean {
    return this.cancelledForNewRun;
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

    // If config file changed, reload config and recreate watchers
    if (event.isConfigFile && event.type === 'changed') {
      logger.info('Config file changed, reloading watchers');
      this.reloadConfigAndWatchers();
    }

    // Store the change info
    this.pendingChanges.set(event.uri.fsPath, event);

    // Debounce the run
    this.debouncer.debounce(event.uri.fsPath);

    // Update status bar to show pending changes
    this.updateStatusBar();
  }

  /**
   * Handle a file delete event
   */
  private handleFileDelete(event: FileChangeEvent): void {
    const fileType = this.fileWatcher.getDeletedFileType(event.uri);

    if (!fileType) {
      // Not a critical file, normal handling continues
      return;
    }

    // Log the deletion
    logger.warn(`Critical file deleted: ${event.fileName} (${fileType})`);

    // Show appropriate warning to user
    if (fileType === 'config') {
      showNotification(
        'warning',
        `Config file deleted: ${event.fileName}. LiveCalc may not function correctly until it is restored.`
      );
    } else if (fileType === 'model') {
      showNotification(
        'warning',
        `Model file deleted: ${event.fileName}. The next run will fail until it is restored.`
      );
    } else if (fileType === 'policy') {
      showNotification(
        'warning',
        `Policy file deleted: ${event.fileName}. The next run will fail until it is restored.`
      );
    } else if (fileType === 'assumption') {
      showNotification(
        'warning',
        `Assumption file deleted: ${event.fileName}. The next run will fail until it is restored.`
      );
    }
  }

  /**
   * Reload config and recreate file watchers
   */
  private async reloadConfigAndWatchers(): Promise<void> {
    try {
      const configPath = await this.configLoader.findConfigFile();
      if (!configPath) {
        logger.warn('No config file found during reload');
        return;
      }
      const config = await this.configLoader.loadConfig(configPath);
      if (config) {
        const configDir = this.configLoader.getConfigDirectory();
        if (configDir) {
          this.fileWatcher.updateConfig(config, configDir);
          logger.info('Watchers recreated after config change');
        }
      }
    } catch (error) {
      logger.error(`Failed to reload config after change: ${error}`);
    }
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

    // Cancel any in-progress run (with flag indicating new run starting)
    this.cancelCurrentRun(true);

    // Create new cancellation token
    this.currentCancellation = new vscode.CancellationTokenSource();

    // Reset the cancelled flag now that we're starting a new run
    this.cancelledForNewRun = false;

    // Mark as running
    this.isRunning = true;
    this.updateStatusBar();

    try {
      // Pass isAutoRun flag and trigger info to run command
      await this.runCommand({
        isAutoRun: true,
        triggerInfo: this.lastTrigger
          ? {
              files: this.lastTrigger.files,
              types: this.lastTrigger.types,
            }
          : undefined,
      });
    } catch (error) {
      // Errors are handled by the run command itself
      logger.debug('Auto-run completed with error (handled by run command)');
    } finally {
      this.isRunning = false;
      this.currentCancellation?.dispose();
      this.currentCancellation = undefined;
      this.cancelledForNewRun = false;
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
