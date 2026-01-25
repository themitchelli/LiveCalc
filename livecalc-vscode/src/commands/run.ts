import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logging/logger';
import { StatusBar } from '../ui/status-bar';
import { Notifications } from '../ui/notifications';
import { ConfigLoader } from '../config/config-loader';
import { ResultsPanel, ExtensionMessage, TriggerInfo } from '../ui/results-panel';
import { createResultsState } from '../ui/results-state';
import { ComparisonManager } from '../ui/comparison';
import { RunHistoryManager } from '../auto-run/run-history';
import { ResultsExporter, ExportFormat } from '../ui/export';
import { classifyError, LiveCalcWarning, COMMON_WARNINGS } from '../ui/error-types';
import { getEngineManager, EngineError } from '../engine/livecalc-engine';
import { loadData, DataLoadError } from '../data/data-loader';
import { PipelineView, PipelineDataInspector, BreakpointManager, TimingProfiler } from '../pipeline';
import { hasPipeline } from '../pipeline/pipeline-validator';

/**
 * Trigger info passed from auto-run controller
 */
export interface TriggerFiles {
  /** File names that triggered the run */
  files: string[];
  /** Change types for each file */
  types: ('changed' | 'created' | 'deleted')[];
}

/**
 * Options for run command execution
 */
export interface RunOptions {
  /**
   * Indicates this run was triggered by auto-run
   * Affects how cancellation is displayed
   */
  isAutoRun?: boolean;
  /**
   * Files that triggered the auto-run (only when isAutoRun is true)
   */
  triggerInfo?: TriggerFiles;
  /**
   * Absolute file paths that changed (for smart reload optimization)
   * Used by auto-run to only reload changed data
   */
  changedFilePaths?: string[];
}

/**
 * Run command handler
 * Executes the valuation using the WASM engine
 */
export async function runCommand(
  statusBar: StatusBar,
  configLoader: ConfigLoader,
  resultsPanel: ResultsPanel,
  comparisonManager: ComparisonManager,
  runHistoryManager: RunHistoryManager,
  pipelineView: PipelineView,
  pipelineDataInspector: PipelineDataInspector,
  breakpointManager: BreakpointManager,
  options: RunOptions = {}
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

  // Check if config has pipeline
  const usesPipeline = hasPipeline(config);
  if (usesPipeline && config.pipeline) {
    logger.info(`Pipeline detected with ${config.pipeline.nodes.length} nodes`);
    pipelineView.initialize(config.pipeline);

    // Import breakpoints from config if defined
    if (config.pipeline.debug?.breakpoints) {
      await breakpointManager.importFromConfig(config.pipeline.debug.breakpoints);
      logger.info(`Imported ${config.pipeline.debug.breakpoints.length} breakpoints from config`);
    }

    // Update pipeline view with current breakpoints
    pipelineView.setBreakpoints(breakpointManager.exportToConfig());
  } else {
    logger.debug('No pipeline configuration found');
  }

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
          logger.info('Execution cancelled');
          statusBar.setCancelled('Cancelled before data loading');
          resultsPanel.setCancelled('Execution cancelled', false);
          // Reset status bar to ready after brief display
          setTimeout(() => statusBar.setReady(), 1500);
          return;
        }

        progress.report({ message: 'Loading data files...' });
        resultsPanel.setLoading('Loading data files...');
        logger.milestone('Loading data files');
        logger.startTimer('Data loading');

        // Load data files with validation
        // Use smart reload if this is an auto-run with changed files
        const data = await loadData(config, configDir, {
          reportValidation: true,
          smartReload: options.isAutoRun,
          changedFiles: options.changedFilePaths,
        });

        logger.endTimer('Data loading', 'info');

        // Log smart reload analysis if used
        if (data.reloadAnalysis) {
          logger.info(
            `Smart reload: ${data.reloadAnalysis.strategy} - ${data.reloadAnalysis.reason}`
          );
        }

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
          logger.info('Execution cancelled after data loading');
          statusBar.setCancelled('Cancelled before valuation');
          resultsPanel.setCancelled('Execution cancelled', false);
          // Reset status bar to ready after brief display
          setTimeout(() => statusBar.setReady(), 1500);
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
        await Notifications.completed(elapsed, data.policyCount, result.scenarioCount, options.isAutoRun ?? false);

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

        // Collect warnings for display
        const allWarnings: string[] = [];

        // Add data validation warnings
        if (data.warnings.length > 0) {
          allWarnings.push(...data.warnings.map((w) => w.message));
        }

        // Add performance warnings
        if (data.policyCount > 50000) {
          allWarnings.push(COMMON_WARNINGS.LARGE_POLICY_FILE(data.policyCount).message);
        }

        if (result.executionTimeMs > 10000) {
          allWarnings.push(COMMON_WARNINGS.EXECUTION_SLOW(result.executionTimeMs / 1000).message);
        }

        // Set warnings on results state
        if (allWarnings.length > 0) {
          resultsState.warnings = allWarnings;
        }

        // Send results to panel
        resultsPanel.setResults(resultsState);

        // Send trigger info for auto-run change indicator
        if (options.isAutoRun && options.triggerInfo) {
          const triggerInfo: TriggerInfo = {
            files: options.triggerInfo.files,
            types: options.triggerInfo.types.map((t) =>
              t === 'changed' ? 'modified' : t
            ) as ('modified' | 'created' | 'deleted')[],
            isAutoRun: true,
          };
          resultsPanel.setTriggerInfo(triggerInfo);
        } else {
          // Clear any previous trigger info for manual runs
          resultsPanel.setTriggerInfo(null);
        }

        // Handle comparison (only if setting enabled)
        const showComparison = vsConfig.get<boolean>('showComparison', true);
        if (showComparison) {
          const comparison = comparisonManager.calculateComparison(resultsState);
          const comparisonInfo = comparisonManager.getComparisonInfo();

          if (comparison && comparisonInfo) {
            resultsPanel.setComparison(comparison, comparisonInfo);
            logger.debug(
              `Comparison to ${comparisonInfo.isPinned ? 'pinned' : 'previous'} baseline: ` +
                `Mean delta ${comparison.deltas.mean.percentage.toFixed(1)}%`
            );
          }
        } else {
          // Comparison disabled - don't show deltas
          resultsPanel.setComparison(null, null);
        }

        // Record this result for future comparison (always, even if display disabled)
        await comparisonManager.recordResult(resultsState);

        // Add to run history
        const trigger = options.isAutoRun ? 'auto' : 'manual';
        const triggerFile = options.triggerInfo?.files?.[0] ?? null;
        runHistoryManager.addRun(resultsState, trigger, triggerFile);

        // Update history display in panel
        resultsPanel.setHistory(runHistoryManager.getEntries());
      } catch (error) {
        const elapsed = Date.now() - startTime;

        // Handle cancellation
        if (error instanceof EngineError && error.code === 'CANCELLED') {
          logger.info(`Execution cancelled${options.isAutoRun ? ' (new run starting)' : ' by user'}`);
          // For auto-run cancellation, show "new run starting" message
          if (options.isAutoRun) {
            statusBar.setCancelled('New run starting...');
            resultsPanel.setCancelled(undefined, true);
          } else {
            statusBar.setCancelled('Cancelled by user');
            resultsPanel.setCancelled('Execution cancelled', false);
            // Reset status bar to ready after brief display
            setTimeout(() => statusBar.setReady(), 1500);
          }
          return;
        }

        // Classify the error and get structured error info
        const filePath = error instanceof DataLoadError ? error.filePath : undefined;
        const structuredError = classifyError(error, { filePath });

        logger.error(`Valuation failed after ${elapsed}ms`, error instanceof Error ? error : undefined);
        statusBar.setError(structuredError.message);
        resultsPanel.setStructuredError(structuredError);
        await Notifications.errorWithPreferences(structuredError.message, options.isAutoRun ?? false);
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
  comparisonManager: ComparisonManager,
  runHistoryManager: RunHistoryManager,
  pipelineView: PipelineView,
  pipelineDataInspector: PipelineDataInspector,
  breakpointManager: BreakpointManager,
  timingProfiler: TimingProfiler
): vscode.Disposable {
  // Set up message handler for comparison and export actions from webview
  resultsPanel.onMessage(async (message: ExtensionMessage) => {
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
      case 'export':
        // Handle export request
        const exportState = resultsPanel.getState();
        if (exportState.type === 'results') {
          const format = message.format as ExportFormat;
          const result = await ResultsExporter.export(exportState.results, format);
          if (result.success) {
            vscode.window.showInformationMessage(result.message);
          } else if (result.message !== 'Export cancelled') {
            vscode.window.showErrorMessage(result.message);
          }
        } else {
          vscode.window.showWarningMessage('No results to export. Run a valuation first.');
        }
        break;
      case 'viewHistoryRun':
        // View a specific historical run
        if ('runId' in message) {
          const historyResults = runHistoryManager.getResults(message.runId);
          if (historyResults) {
            resultsPanel.setHistoryResults(historyResults, message.runId);
            logger.debug(`Viewing historical run ${message.runId}`);
          } else {
            logger.warn(`Historical run ${message.runId} not found`);
          }
        }
        break;
      case 'compareWithHistory':
        // Compare current with a historical run
        if ('runId' in message) {
          const historicalResults = runHistoryManager.getResults(message.runId);
          const currentPanelState = resultsPanel.getState();
          if (historicalResults && currentPanelState.type === 'results') {
            // Pin the historical run as comparison baseline
            comparisonManager.pinBaseline(historicalResults).then(() => {
              const comparison = comparisonManager.calculateComparison(currentPanelState.results);
              const info = comparisonManager.getComparisonInfo();
              resultsPanel.setComparison(comparison, info);
              logger.info(`Comparing current with historical run ${message.runId}`);
            });
          }
        }
        break;
      case 'exportHistory':
        // Export history to CSV
        vscode.commands.executeCommand('livecalc.exportHistory');
        break;
      case 'clearHistory':
        // Clear run history
        vscode.commands.executeCommand('livecalc.clearHistory');
        break;
      case 'exportBusResource':
        // Export bus resource to CSV
        if ('resourceName' in message) {
          const panelState = resultsPanel.getState();
          if (panelState.type === 'results') {
            const runId = panelState.results.metadata.runId;
            const resource = pipelineDataInspector.getResource(runId, message.resourceName);
            if (resource) {
              const csv = pipelineDataInspector.exportResourceToCsv(resource);
              const fileName = message.resourceName.replace(/[/:]/g, '_');
              const defaultUri = vscode.Uri.file(`${fileName}_${new Date().toISOString().slice(0, 10)}.csv`);

              const uri = await vscode.window.showSaveDialog({
                defaultUri,
                filters: {
                  'CSV files': ['csv'],
                  'All files': ['*'],
                },
              });

              if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, 'utf-8'));
                logger.info(`Bus resource exported to ${uri.fsPath}`);
                vscode.window.showInformationMessage(`LiveCalc: Bus resource exported to ${uri.fsPath}`);
              }
            } else {
              vscode.window.showWarningMessage(`Bus resource ${message.resourceName} not found`);
            }
          }
        }
        break;

      case 'exportTiming':
        // Export timing data to JSON
        {
          const runId = 'runId' in message && message.runId ? message.runId : undefined;
          const json = timingProfiler.exportToJson(runId);
          if (json) {
            const fileName = `pipeline-timing_${new Date().toISOString().slice(0, 10)}.json`;
            const defaultUri = vscode.Uri.file(fileName);

            const uri = await vscode.window.showSaveDialog({
              defaultUri,
              filters: {
                'JSON files': ['json'],
                'All files': ['*'],
              },
            });

            if (uri) {
              await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
              logger.info(`Timing data exported to ${uri.fsPath}`);
              vscode.window.showInformationMessage(`LiveCalc: Timing data exported to ${uri.fsPath}`);
            }
          } else {
            vscode.window.showWarningMessage('No timing data available for export');
          }
        }
        break;

      case 'selectTimingComparison':
        // Compare with baseline run
        if ('baselineRunId' in message) {
          const panelState = resultsPanel.getState();
          if (panelState.type === 'results') {
            const currentRunId = panelState.results.metadata.runId;
            const comparison = timingProfiler.compareRuns(currentRunId, message.baselineRunId);
            if (comparison) {
              resultsPanel.setTimingComparison(comparison);
              logger.info(`Timing comparison: ${currentRunId} vs ${message.baselineRunId}`);
            } else {
              vscode.window.showWarningMessage('Cannot compare runs: timing data not found');
            }
          }
        }
        break;
      case 'debugPause':
        // Pause remote cloud run for debugging
        if ('nodeId' in message) {
          const { getDaaSClient } = await import('../cloud/daas-client');
          const daasClient = getDaaSClient();
          const panelState = resultsPanel.getState();
          if (panelState.type === 'results') {
            const runId = panelState.results.metadata.runId;
            try {
              const result = await daasClient.pauseRun(runId, message.nodeId);
              resultsPanel.setDebugState({
                isPaused: true,
                pausedAt: new Date(),
                currentNode: message.nodeId || null,
                runId
              });
              logger.info(`Remote run ${runId} paused (session: ${result.sessionId})`);
            } catch (error) {
              vscode.window.showErrorMessage(
                `Failed to pause remote run: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        }
        break;
      case 'debugResume':
        // Resume paused remote run
        {
          const { getDaaSClient } = await import('../cloud/daas-client');
          const daasClient = getDaaSClient();
          const panelState = resultsPanel.getState();
          if (panelState.type === 'results') {
            const runId = panelState.results.metadata.runId;
            try {
              await daasClient.resumeRun(runId);
              resultsPanel.setDebugState({
                isPaused: false,
                pausedAt: null,
                currentNode: null,
                runId
              });
              logger.info(`Remote run ${runId} resumed`);
            } catch (error) {
              vscode.window.showErrorMessage(
                `Failed to resume remote run: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        }
        break;
      case 'debugStep':
        // Execute single step in paused pipeline
        {
          const { getDaaSClient } = await import('../cloud/daas-client');
          const daasClient = getDaaSClient();
          const panelState = resultsPanel.getState();
          if (panelState.type === 'results') {
            const runId = panelState.results.metadata.runId;
            try {
              await daasClient.stepRun(runId);
              logger.info(`Remote run ${runId} stepped`);
            } catch (error) {
              vscode.window.showErrorMessage(
                `Failed to step remote run: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        }
        break;
      case 'debugInspect':
        // Inspect raw memory segment from remote SAB
        if ('busUri' in message && 'offset' in message && 'length' in message) {
          const { getDaaSClient } = await import('../cloud/daas-client');
          const daasClient = getDaaSClient();
          const panelState = resultsPanel.getState();
          if (panelState.type === 'results') {
            const runId = panelState.results.metadata.runId;
            try {
              const data = await daasClient.inspectMemory(
                runId,
                message.busUri,
                message.offset,
                message.length
              );
              // Convert ArrayBuffer to readable format and display
              const view = new Float64Array(data);
              const preview = Array.from(view.slice(0, 10)).map(v => v.toFixed(2)).join(', ');
              vscode.window.showInformationMessage(
                `Memory at ${message.busUri}[${message.offset}]: [${preview}${view.length > 10 ? '...' : ''}]`
              );
              logger.info(`Inspected ${message.busUri}: ${view.length} elements`);
            } catch (error) {
              vscode.window.showErrorMessage(
                `Failed to inspect memory: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        }
        break;
      case 'debugBrowseBus':
        // Browse available bus resources
        if ('busUri' in message) {
          const { getDaaSClient } = await import('../cloud/daas-client');
          const daasClient = getDaaSClient();
          const panelState = resultsPanel.getState();
          if (panelState.type === 'results') {
            const runId = panelState.results.metadata.runId;
            try {
              const resources = await daasClient.getBusResources(runId);
              resultsPanel.setBusResources(resources);
              logger.info(`Retrieved ${resources.length} bus resources for run ${runId}`);
            } catch (error) {
              vscode.window.showErrorMessage(
                `Failed to browse bus resources: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        }
        break;
      case 'openAMTable':
        // Open table in Assumptions Manager browser
        if ('tableName' in message) {
          const amUrl = vscode.workspace.getConfiguration('livecalc.assumptionsManager').get<string>('url');
          if (amUrl) {
            const tableUrl = message.version
              ? `${amUrl}/tables?search=${encodeURIComponent(message.tableName)}&version=${encodeURIComponent(message.version)}`
              : `${amUrl}/tables?search=${encodeURIComponent(message.tableName)}`;
            vscode.env.openExternal(vscode.Uri.parse(tableUrl));
            logger.debug(`Opening AM table: ${message.tableName} (${message.version || 'latest'})`);
          } else {
            vscode.window.showWarningMessage(
              'Assumptions Manager URL not configured. Set livecalc.assumptionsManager.url in settings.'
            );
          }
        }
        break;
    }
  });

  // Set up pipeline view message handler for breakpoints
  pipelineView.onMessage(async (message) => {
    switch (message.type) {
      case 'toggleBreakpoint':
        await breakpointManager.toggleBreakpoint(message.nodeId);
        // Update pipeline view with new breakpoint state
        pipelineView.setBreakpoints(breakpointManager.exportToConfig());
        break;
      case 'step':
        await breakpointManager.step();
        break;
      case 'continue':
        await breakpointManager.resume();
        break;
      case 'abort':
        await breakpointManager.abort();
        break;
    }
  });

  // Subscribe to breakpoint manager events to update pipeline view
  context.subscriptions.push(
    breakpointManager.onDidChangeBreakpoints((breakpoints) => {
      const nodeIds = breakpoints.filter((bp) => bp.enabled).map((bp) => bp.nodeId);
      pipelineView.setBreakpoints(nodeIds);
    })
  );

  context.subscriptions.push(
    breakpointManager.onDidPause((pausedState) => {
      pipelineView.setPaused(
        true,
        pausedState.pausedAtNode,
        pausedState.busDataSnapshot,
        pausedState.checksums
      );
    })
  );

  context.subscriptions.push(
    breakpointManager.onDidResume(() => {
      pipelineView.setPaused(false);
    })
  );

  // Manual run from command palette is not an auto-run
  return vscode.commands.registerCommand('livecalc.run', () =>
    runCommand(statusBar, configLoader, resultsPanel, comparisonManager, runHistoryManager, pipelineView, pipelineDataInspector, breakpointManager, { isAutoRun: false })
  );
}
