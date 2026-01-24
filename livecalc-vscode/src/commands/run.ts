import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logging/logger';
import { StatusBar } from '../ui/status-bar';
import { Notifications } from '../ui/notifications';
import { ConfigLoader } from '../config/config-loader';
import { getEngineManager, EngineError } from '../engine/livecalc-engine';
import { loadData, DataLoadError } from '../data/data-loader';

/**
 * Run command handler
 * Executes the valuation using the WASM engine
 */
export async function runCommand(
  statusBar: StatusBar,
  configLoader: ConfigLoader
): Promise<void> {
  logger.separator();
  logger.milestone('Run command invoked');

  // Find config file
  logger.startTimer('Config discovery');
  const configPath = await configLoader.findConfigFile();
  if (!configPath) {
    logger.warn('No livecalc.config.json found');
    await Notifications.noConfigFile();
    return;
  }
  logger.endTimer('Config discovery');
  logger.info(`Config found: ${configPath}`);

  // Load and validate config
  logger.startTimer('Config loading');
  const config = await configLoader.loadConfig(configPath);
  if (!config) {
    logger.error('Failed to load config file');
    return;
  }
  logger.endTimer('Config loading');
  logger.debug(`Scenarios: ${config.scenarios.count}, Seed: ${config.scenarios.seed}`);

  // Update status bar with config path
  statusBar.setConfigPath(configPath);

  // Get config directory for resolving relative paths
  const configDir = path.dirname(configPath);

  // Execute with progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'LiveCalc',
      cancellable: true,
    },
    async (progress, token) => {
      const startTime = Date.now();

      try {
        statusBar.setRunning();
        progress.report({ message: 'Initializing engine...' });

        // Get engine manager
        const engineManager = getEngineManager();

        // Initialize engine (lazy - only initializes once)
        await engineManager.initialize();

        if (token.isCancellationRequested) {
          logger.info('Execution cancelled by user');
          statusBar.setReady();
          return;
        }

        progress.report({ message: 'Loading data files...' });
        logger.milestone('Loading data files');
        logger.startTimer('Data loading');

        // Load data files with validation
        const data = await loadData(config, configDir, { reportValidation: true });

        logger.endTimer('Data loading', 'info');

        // Log cache statistics
        if (data.cacheStats.hits > 0 || data.cacheStats.misses > 0) {
          logger.debug(
            `Data cache: ${data.cacheStats.hits} hits, ${data.cacheStats.misses} misses`
          );
        }

        // Report validation warnings (errors would have thrown)
        if (data.warnings.length > 0) {
          logger.warn(`Data loaded with ${data.warnings.length} warnings - check Problems panel`);
        }

        logger.info(`Loaded ${data.policyCount} policies`);

        if (token.isCancellationRequested) {
          logger.info('Execution cancelled by user');
          statusBar.setReady();
          return;
        }

        progress.report({ message: `Running valuation (${data.policyCount} policies)...` });
        logger.milestone('Running valuation');
        logger.startTimer('Valuation execution');

        // Create progress callback
        const progressCallback = (percent: number) => {
          progress.report({
            message: `Running valuation... ${percent}%`,
          });
          statusBar.setProgress(percent);
        };

        // Run valuation
        const result = await engineManager.runValuation(
          config,
          data.policiesCsv,
          data.mortalityCsv,
          data.lapseCsv,
          data.expensesCsv,
          progressCallback,
          token
        );

        logger.endTimer('Valuation execution', 'info');

        const elapsed = Date.now() - startTime;
        statusBar.setCompleted(elapsed, data.policyCount, result.scenarioCount);
        Notifications.completed(elapsed, data.policyCount, result.scenarioCount);

        // Log performance metrics
        logger.logPerformanceMetrics({
          policyCount: data.policyCount,
          scenarioCount: result.scenarioCount,
          executionTimeMs: result.executionTimeMs,
        });

        // Log results summary
        logger.info(
          `Results: Mean NPV = ${result.mean.toFixed(2)}, ` +
            `StdDev = ${result.stdDev.toFixed(2)}, ` +
            `CTE95 = ${result.cte95.toFixed(2)}`
        );
        logger.milestone('Run complete');

        // TODO: Open results panel (PRD-LC-004)
      } catch (error) {
        const elapsed = Date.now() - startTime;

        // Handle cancellation
        if (error instanceof EngineError && error.code === 'CANCELLED') {
          logger.info('Execution cancelled by user');
          statusBar.setReady();
          return;
        }

        // Log and display error
        let errorMessage: string;
        if (error instanceof DataLoadError) {
          errorMessage = `Data loading failed: ${error.message}`;
          if (error.filePath) {
            errorMessage += ` (${error.filePath})`;
          }
        } else if (error instanceof EngineError) {
          errorMessage = `Engine error: ${error.message}`;
        } else {
          errorMessage = error instanceof Error ? error.message : String(error);
        }

        logger.error(`Valuation failed after ${elapsed}ms`, error instanceof Error ? error : undefined);
        statusBar.setError(errorMessage);
        await Notifications.error(errorMessage);
      }
    }
  );
}

/**
 * Register the run command
 */
export function registerRunCommand(
  context: vscode.ExtensionContext,
  statusBar: StatusBar,
  configLoader: ConfigLoader
): vscode.Disposable {
  return vscode.commands.registerCommand('livecalc.run', () =>
    runCommand(statusBar, configLoader)
  );
}
