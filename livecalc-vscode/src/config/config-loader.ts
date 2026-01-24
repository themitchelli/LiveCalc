import * as vscode from 'vscode';
import * as path from 'path';
import { LiveCalcConfig } from '../types';
import { logger } from '../logging/logger';
import { ConfigValidator } from './config-validator';

/**
 * Config file loader and validator
 */
export class ConfigLoader implements vscode.Disposable {
  private cachedConfig: LiveCalcConfig | null = null;
  private cachedConfigPath: string | null = null;
  private cachedConfigText: string | null = null;
  private configWatcher: vscode.FileSystemWatcher | null = null;
  private validator: ConfigValidator;

  constructor(context: vscode.ExtensionContext) {
    this.validator = new ConfigValidator();
    context.subscriptions.push(this.validator);

    // Watch for config file changes
    this.configWatcher = vscode.workspace.createFileSystemWatcher(
      '**/livecalc.config.json'
    );

    this.configWatcher.onDidChange(async (uri) => {
      logger.debug('Config file changed, invalidating cache');
      this.invalidateCache();
      // Re-validate the changed config file
      await this.validateConfigFile(uri.fsPath);
    });

    this.configWatcher.onDidDelete((uri) => {
      logger.debug('Config file deleted, invalidating cache');
      this.invalidateCache();
      // Clear diagnostics for deleted file
      this.validator.clearDiagnostics(uri.fsPath);
    });

    this.configWatcher.onDidCreate(async (uri) => {
      logger.debug('Config file created, validating');
      await this.validateConfigFile(uri.fsPath);
    });

    context.subscriptions.push(this.configWatcher);
  }

  /**
   * Validate a config file and update diagnostics
   */
  private async validateConfigFile(configPath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(configPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf-8');

      const config = JSON.parse(text) as LiveCalcConfig;
      this.validator.validateAndReport(config, configPath, text);
    } catch (error) {
      // JSON parse error - report it as a diagnostic
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Config parse error: ${errorMessage}`);
    }
  }

  /**
   * Find the config file in the workspace
   * Searches workspace root, then within workspace, then parent directories
   */
  public async findConfigFile(): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;

    // First check workspace root
    const configPath = path.join(rootPath, 'livecalc.config.json');
    if (await this.fileExists(configPath)) {
      logger.debug(`Found config at workspace root: ${configPath}`);
      return configPath;
    }

    // Search within workspace
    const files = await vscode.workspace.findFiles('**/livecalc.config.json', '**/node_modules/**', 1);
    if (files.length > 0) {
      const foundPath = files[0].fsPath;
      logger.debug(`Found config within workspace: ${foundPath}`);
      return foundPath;
    }

    // Search parent directories (up to 5 levels)
    const parentConfig = await this.searchParentDirectories(rootPath);
    if (parentConfig) {
      logger.debug(`Found config in parent directory: ${parentConfig}`);
      return parentConfig;
    }

    return null;
  }

  /**
   * Search parent directories for config file
   */
  private async searchParentDirectories(startPath: string): Promise<string | null> {
    let currentPath = startPath;
    const maxLevels = 5;

    for (let i = 0; i < maxLevels; i++) {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        // Reached root
        break;
      }

      const configPath = path.join(parentPath, 'livecalc.config.json');
      if (await this.fileExists(configPath)) {
        return configPath;
      }

      currentPath = parentPath;
    }

    return null;
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load and parse the config file
   */
  public async loadConfig(configPath: string): Promise<LiveCalcConfig | null> {
    // Return cached config if still valid
    if (this.cachedConfig && this.cachedConfigPath === configPath) {
      logger.debug('Using cached config');
      return this.cachedConfig;
    }

    try {
      const uri = vscode.Uri.file(configPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf-8');

      const config = JSON.parse(text) as LiveCalcConfig;
      logger.info(`Loaded config from ${configPath}`);

      // Validate using the validator (updates Problems panel)
      const errors = this.validator.validateAndReport(config, configPath, text);
      const hasErrors = errors.some(e => e.severity === vscode.DiagnosticSeverity.Error);

      if (hasErrors) {
        for (const error of errors) {
          if (error.severity === vscode.DiagnosticSeverity.Error) {
            logger.error(`Config validation error: ${error.message}`);
          }
        }
        vscode.window.showErrorMessage(
          `LiveCalc: Config validation failed. See Problems panel for details.`
        );
        return null;
      }

      // Cache the valid config
      this.cachedConfig = config;
      this.cachedConfigPath = configPath;
      this.cachedConfigText = text;

      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to load config: ${errorMessage}`);
      vscode.window.showErrorMessage(`LiveCalc: Failed to load config: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Get the raw config text (for inheritance resolution)
   */
  public getCachedConfigText(): string | null {
    return this.cachedConfigText;
  }

  /**
   * Check if the current config has validation errors
   */
  public hasValidationErrors(): boolean {
    if (!this.cachedConfigPath) {
      return false;
    }
    return this.validator.hasErrors(this.cachedConfigPath);
  }

  /**
   * Get the validator instance for direct validation access
   */
  public getValidator(): ConfigValidator {
    return this.validator;
  }

  /**
   * Get the directory containing the config file
   */
  public getConfigDirectory(): string | null {
    if (this.cachedConfigPath) {
      return path.dirname(this.cachedConfigPath);
    }
    return null;
  }

  /**
   * Invalidate the cached config
   */
  public invalidateCache(): void {
    this.cachedConfig = null;
    this.cachedConfigPath = null;
  }

  public dispose(): void {
    if (this.configWatcher) {
      this.configWatcher.dispose();
    }
  }
}
