import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logging/logger';
import { LiveCalcConfig } from '../types';

/**
 * File change event with type information
 */
export interface FileChangeEvent {
  uri: vscode.Uri;
  type: 'changed' | 'created' | 'deleted';
  fileName: string;
}

/**
 * File watcher for LiveCalc-relevant files
 * Watches model files, assumption files, and config files
 */
export class FileWatcher implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private configDir: string | undefined;
  private config: LiveCalcConfig | undefined;
  private onChangeCallback: ((event: FileChangeEvent) => void) | undefined;
  private defaultExcludes = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'];
  private customExcludes: string[] = [];

  /**
   * Set the callback for file change events
   */
  public onFileChange(callback: (event: FileChangeEvent) => void): void {
    this.onChangeCallback = callback;
  }

  /**
   * Update the config and recreate watchers for referenced files
   */
  public updateConfig(config: LiveCalcConfig, configDir: string): void {
    this.config = config;
    this.configDir = configDir;
    this.recreateWatchers();
  }

  /**
   * Update custom exclude patterns
   */
  public setCustomExcludes(excludes: string[]): void {
    this.customExcludes = excludes;
    this.recreateWatchers();
  }

  /**
   * Get the list of files being watched (for logging)
   */
  public getWatchedPatterns(): string[] {
    const patterns: string[] = [];

    // Always watch config files
    patterns.push('**/livecalc.config.json');

    if (this.config && this.configDir) {
      // Model file
      patterns.push(this.resolvePattern(this.config.model));

      // Policy file
      if (this.config.policies) {
        patterns.push(this.resolvePattern(this.config.policies));
      }

      // Assumption files
      patterns.push(this.resolvePattern(this.config.assumptions.mortality));
      patterns.push(this.resolvePattern(this.config.assumptions.lapse));
      patterns.push(this.resolvePattern(this.config.assumptions.expenses));
    } else {
      // Fallback: watch all potentially relevant files
      patterns.push('**/*.mga');
      patterns.push('**/*.csv');
      patterns.push('**/*.json');
    }

    return patterns;
  }

  /**
   * Recreate file watchers based on current config
   */
  private recreateWatchers(): void {
    // Dispose existing watchers
    this.disposeWatchers();

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      logger.warn('No workspace folders, file watching disabled');
      return;
    }

    // Create watcher for config file (always watch this)
    this.createWatcher('**/livecalc.config.json');

    if (this.config && this.configDir) {
      // Watch specific files referenced in config
      this.watchConfigReferencedFiles();
    } else {
      // Fallback: watch all potentially relevant file types
      this.createWatcher('**/*.mga');
      this.createWatcher('**/*.csv');
      // Be careful with JSON - only watch in certain locations to avoid noise
      this.createWatcher('**/livecalc.config.json');
    }

    logger.debug(`File watchers created: ${this.watchers.length} watchers active`);
    const patterns = this.getWatchedPatterns();
    for (const pattern of patterns) {
      logger.debug(`  Watching: ${pattern}`);
    }
  }

  /**
   * Watch files specifically referenced in the config
   */
  private watchConfigReferencedFiles(): void {
    if (!this.config || !this.configDir) {
      return;
    }

    // Watch model file
    const modelPath = this.resolvePath(this.config.model);
    if (modelPath) {
      this.createWatcher(new vscode.RelativePattern(path.dirname(modelPath), path.basename(modelPath)));
    }

    // Watch policy file
    if (this.config.policies) {
      const policyPath = this.resolvePath(this.config.policies);
      if (policyPath) {
        this.createWatcher(new vscode.RelativePattern(path.dirname(policyPath), path.basename(policyPath)));
      }
    }

    // Watch assumption files
    const assumptions = this.config.assumptions;
    for (const key of ['mortality', 'lapse', 'expenses'] as const) {
      const assumptionPath = this.resolvePath(assumptions[key]);
      if (assumptionPath) {
        this.createWatcher(new vscode.RelativePattern(path.dirname(assumptionPath), path.basename(assumptionPath)));
      }
    }
  }

  /**
   * Resolve a config path to an absolute path
   */
  private resolvePath(configPath: string): string | undefined {
    if (!this.configDir) {
      return undefined;
    }

    // Handle local:// prefix
    if (configPath.startsWith('local://')) {
      const relativePath = configPath.slice('local://'.length);
      return path.join(this.configDir, relativePath);
    }

    // Handle assumptions:// prefix (not supported for file watching yet)
    if (configPath.startsWith('assumptions://')) {
      return undefined;
    }

    // Absolute path
    if (path.isAbsolute(configPath)) {
      return configPath;
    }

    // Relative path
    return path.join(this.configDir, configPath);
  }

  /**
   * Resolve a path to a glob pattern
   */
  private resolvePattern(configPath: string): string {
    const resolved = this.resolvePath(configPath);
    if (resolved) {
      return resolved;
    }
    return configPath;
  }

  /**
   * Create a file watcher for a pattern
   */
  private createWatcher(pattern: vscode.GlobPattern): void {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange((uri) => {
      if (this.shouldIgnore(uri)) {
        return;
      }
      this.emitChange(uri, 'changed');
    });

    watcher.onDidCreate((uri) => {
      if (this.shouldIgnore(uri)) {
        return;
      }
      this.emitChange(uri, 'created');
    });

    watcher.onDidDelete((uri) => {
      if (this.shouldIgnore(uri)) {
        return;
      }
      this.emitChange(uri, 'deleted');
    });

    this.watchers.push(watcher);
  }

  /**
   * Check if a file should be ignored based on exclude patterns
   */
  private shouldIgnore(uri: vscode.Uri): boolean {
    const filePath = uri.fsPath;
    const allExcludes = [...this.defaultExcludes, ...this.customExcludes];

    for (const pattern of allExcludes) {
      // Simple pattern matching (could be enhanced with micromatch)
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\//g, '\\/');
      const regex = new RegExp(regexPattern);
      if (regex.test(filePath)) {
        logger.debug(`Ignoring file (matched exclude pattern ${pattern}): ${filePath}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a file is relevant to the current config
   */
  public isRelevantFile(uri: vscode.Uri): boolean {
    const filePath = uri.fsPath;
    const fileName = path.basename(filePath);

    // Config file is always relevant
    if (fileName === 'livecalc.config.json') {
      return true;
    }

    // If no config, use extension-based relevance
    if (!this.config || !this.configDir) {
      const ext = path.extname(filePath).toLowerCase();
      return ext === '.mga' || ext === '.csv' || ext === '.json';
    }

    // Check if file matches any referenced file in config
    const referencedPaths = this.getReferencedPaths();
    return referencedPaths.some((refPath) => {
      const resolved = this.resolvePath(refPath);
      return resolved && path.normalize(resolved) === path.normalize(filePath);
    });
  }

  /**
   * Get all paths referenced in the config
   */
  private getReferencedPaths(): string[] {
    if (!this.config) {
      return [];
    }

    const paths: string[] = [this.config.model];

    if (this.config.policies) {
      paths.push(this.config.policies);
    }

    paths.push(
      this.config.assumptions.mortality,
      this.config.assumptions.lapse,
      this.config.assumptions.expenses
    );

    return paths;
  }

  /**
   * Emit a file change event
   */
  private emitChange(uri: vscode.Uri, type: 'changed' | 'created' | 'deleted'): void {
    if (!this.onChangeCallback) {
      return;
    }

    const event: FileChangeEvent = {
      uri,
      type,
      fileName: path.basename(uri.fsPath),
    };

    logger.debug(`File ${type}: ${event.fileName}`);
    this.onChangeCallback(event);
  }

  /**
   * Dispose all watchers
   */
  private disposeWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }

  public dispose(): void {
    this.disposeWatchers();
    this.onChangeCallback = undefined;
  }
}
