import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logging/logger';
import { StatusBar } from '../ui/status-bar';
import { Notifications } from '../ui/notifications';
import { ConfigLoader } from '../config/config-loader';
import { ResultsPanel, ExtensionMessage } from '../ui/results-panel';
import { createResultsState } from '../ui/results-state';
import { ComparisonManager } from '../ui/comparison';
import { getEngineManager, EngineError } from '../engine/livecalc-engine';
import { loadData, DataLoadError } from '../data/data-loader';

/**
 * Run command handler
 * Executes the valuation using the WASM engine
 */
export async function runCommand(
  statusBar: StatusBar,
  configLoader: ConfigLoader,
  resultsPanel: ResultsPanel,
  comparisonManager: ComparisonManager
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

  // Show results panel with loading state
  resultsPanel.show();

  // Send display settings from VS Code configuration
  const vsConfig = vscode.workspace.getConfiguration('livecalc');
  resultsPanel.setSettings({
    currency: vsConfig.get<'GBP' | 'USD' | 'EUR'>('currency', 'GBP'),
    decimalPlaces: vsConfig.get<number>('decimalPlaces', 0),
  });

  resultsPanel.setLoading('Initializing...');

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
        resultsPanel.setLoading('Initializing engine...');

        // Get engine manager
        const engineManager = getEngineManager();

        // Initialize engine (lazy - only initializes once)
        await engineManager.initialize();

        if (token.isCancellationRequested) {
          logger.info('Execution cancelled by user');
          statusBar.setReady();
          resultsPanel.setError('Execution cancelled');
          return;
        }

        progress.report({ message: 'Loading data files...' });
        resultsPanel.setLoading('Loading data files...');
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
          resultsPanel.setError('Execution cancelled');
          return;
        }

        progress.report({ message: `Running valuation (${data.policyCount} policies)...` });
        resultsPanel.setLoading(`Running valuation (${data.policyCount.toLocaleString()} policies)...`);
        logger.milestone('Running valuation');
        logger.startTimer('Valuation execution');

        // Create progress callback
        const progressCallback = (percent: number) => {
          progress.report({
            message: `Running valuation... ${percent}%`,
          });
          statusBar.setProgress(percent);
          resultsPanel.setLoading(`Running valuation... ${percent}%`);
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

        // Create results state and send to panel
        const resultsState = createResultsState(result, config, configDir, data.policyCount, {
          assumptionMeta: data.assumptionMeta,
          // Multipliers would come from config if supported
          multipliers: undefined,
        });

        // Add warnings if any (convert CsvValidationError to string messages)
        if (data.warnings.length > 0) {
          resultsState.warnings = data.warnings.map((w) => w.message);
        }

        // Send results to panel
        resultsPanel.setResults(resultsState);

        // Handle comparison
        const comparison = comparisonManager.calculateComparison(resultsState);
        const comparisonInfo = comparisonManager.getComparisonInfo();

        if (comparison && comparisonInfo) {
          resultsPanel.setComparison(comparison, comparisonInfo);
          logger.debug(
            `Comparison to ${comparisonInfo.isPinned ? 'pinned' : 'previous'} baseline: ` +
              `Mean delta ${comparison.deltas.mean.percentage.toFixed(1)}%`
          );
        }

        // Record this result for future comparison
        await comparisonManager.recordResult(resultsState);
      } catch (error) {
        const elapsed = Date.now() - startTime;

        // Handle cancellation
        if (error instanceof EngineError && error.code === 'CANCELLED') {
          logger.info('Execution cancelled by user');
          statusBar.setReady();
          resultsPanel.setError('Execution cancelled by user');
          return;
        }

        // Log and display error
        let errorMessage: string;
        let errorDetails: string | undefined;

        if (error instanceof DataLoadError) {
          errorMessage = `Data loading failed: ${error.message}`;
          if (error.filePath) {
            errorMessage += ` (${error.filePath})`;
          }
        } else if (error instanceof EngineError) {
          errorMessage = `Engine error: ${error.message}`;
          errorDetails = error.stack;
        } else {
          errorMessage = error instanceof Error ? error.message : String(error);
          errorDetails = error instanceof Error ? error.stack : undefined;
        }

        logger.error(`Valuation failed after ${elapsed}ms`, error instanceof Error ? error : undefined);
        statusBar.setError(errorMessage);
        resultsPanel.setError(errorMessage, errorDetails);
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
  configLoader: ConfigLoader,
  resultsPanel: ResultsPanel,
  comparisonManager: ComparisonManager
): vscode.Disposable {
  // Set up message handler for comparison actions from webview
  resultsPanel.onMessage((message: ExtensionMessage) => {
    switch (message.type) {
      case 'pinComparison':
        // Pin current results as baseline
        const state = resultsPanel.getState();
        if (state.type === 'results') {
          comparisonManager.pinBaseline(state.results).then(() => {
            // Send updated comparison info to webview
            const comparison = comparisonManager.calculateComparison(state.results);
            const info = comparisonManager.getComparisonInfo();
            resultsPanel.setComparison(comparison, info);
            logger.info('Results pinned as comparison baseline');
          });
        }
        break;
      case 'clearComparison':
        // Clear comparison state
        comparisonManager.clearComparison().then(() => {
          resultsPanel.setComparison(null, null);
          resultsPanel.setComparisonBaseline(null);
          logger.info('Comparison cleared');
        });
        break;
      case 'toggleChartOverlay':
        // Send baseline distribution for chart overlay
        const compInfo = comparisonManager.getComparisonInfo();
        if (compInfo) {
          resultsPanel.setComparisonBaseline(compInfo.baselineDistribution);
        }
        break;
    }
  });

  return vscode.commands.registerCommand('livecalc.run', () =>
    runCommand(statusBar, configLoader, resultsPanel, comparisonManager)
  );
}
