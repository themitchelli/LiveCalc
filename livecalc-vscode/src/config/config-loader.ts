import * as vscode from 'vscode';
import * as path from 'path';
import { LiveCalcConfig } from '../types';
import { logger } from '../logging/logger';

/**
 * Config file loader and validator
 */
export class ConfigLoader {
  private cachedConfig: LiveCalcConfig | null = null;
  private cachedConfigPath: string | null = null;
  private configWatcher: vscode.FileSystemWatcher | null = null;

  constructor(context: vscode.ExtensionContext) {
    // Watch for config file changes
    this.configWatcher = vscode.workspace.createFileSystemWatcher(
      '**/livecalc.config.json'
    );

    this.configWatcher.onDidChange(() => {
      logger.debug('Config file changed, invalidating cache');
      this.invalidateCache();
    });

    this.configWatcher.onDidDelete(() => {
      logger.debug('Config file deleted, invalidating cache');
      this.invalidateCache();
    });

    context.subscriptions.push(this.configWatcher);
  }

  /**
   * Find the config file in the workspace
   * Searches workspace root and parent directories
   */
  public async findConfigFile(): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    // First check workspace root
    const rootPath = workspaceFolders[0].uri.fsPath;
    const configPath = path.join(rootPath, 'livecalc.config.json');

    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(configPath));
      logger.debug(`Found config at ${configPath}`);
      return configPath;
    } catch {
      // Not found in root, search for it in workspace
      const files = await vscode.workspace.findFiles('**/livecalc.config.json', '**/node_modules/**', 1);
      if (files.length > 0) {
        const foundPath = files[0].fsPath;
        logger.debug(`Found config at ${foundPath}`);
        return foundPath;
      }
    }

    return null;
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

      // Validate required fields
      const errors = this.validateConfig(config);
      if (errors.length > 0) {
        for (const error of errors) {
          logger.error(`Config validation error: ${error}`);
        }
        vscode.window.showErrorMessage(
          `LiveCalc: Config validation failed: ${errors[0]}`
        );
        return null;
      }

      // Cache the valid config
      this.cachedConfig = config;
      this.cachedConfigPath = configPath;

      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to load config: ${errorMessage}`);
      vscode.window.showErrorMessage(`LiveCalc: Failed to load config: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Validate the config structure
   */
  private validateConfig(config: LiveCalcConfig): string[] {
    const errors: string[] = [];

    if (!config.model) {
      errors.push('Missing required field: model');
    }

    if (!config.assumptions) {
      errors.push('Missing required field: assumptions');
    } else {
      if (!config.assumptions.mortality) {
        errors.push('Missing required field: assumptions.mortality');
      }
      if (!config.assumptions.lapse) {
        errors.push('Missing required field: assumptions.lapse');
      }
      if (!config.assumptions.expenses) {
        errors.push('Missing required field: assumptions.expenses');
      }
    }

    if (!config.scenarios) {
      errors.push('Missing required field: scenarios');
    } else {
      if (typeof config.scenarios.count !== 'number' || config.scenarios.count < 1) {
        errors.push('scenarios.count must be a positive number');
      }
      if (typeof config.scenarios.seed !== 'number') {
        errors.push('scenarios.seed must be a number');
      }
      if (!config.scenarios.interestRate) {
        errors.push('Missing required field: scenarios.interestRate');
      }
    }

    return errors;
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
