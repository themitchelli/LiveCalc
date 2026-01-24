import * as vscode from 'vscode';
import { registerRunCommand } from './run';
import { registerInitializeCommand } from './initialize';
import { StatusBar } from '../ui/status-bar';
import { ConfigLoader } from '../config/config-loader';
import { ResultsPanel } from '../ui/results-panel';
import { ComparisonManager } from '../ui/comparison';
import { RunHistoryManager } from '../auto-run/run-history';
import { AutoRunController } from '../auto-run';
import { PipelineView, PipelineDataInspector, BreakpointManager, TimingProfiler } from '../pipeline';
import { AuthManager, AMStatusBar, AMCache, AssumptionTreeDataProvider, AssumptionTreeItem, AssumptionsManagerClient } from '../assumptions-manager';
import { executeAMLogin } from './am-login';
import { executeAMLogout, executeAMClearCache } from './am-logout';
import { logger } from '../logging/logger';

/**
 * Register all LiveCalc commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  statusBar: StatusBar,
  configLoader: ConfigLoader,
  resultsPanel: ResultsPanel,
  comparisonManager: ComparisonManager,
  runHistoryManager: RunHistoryManager,
  autoRunController: AutoRunController,
  pipelineView: PipelineView,
  pipelineDataInspector: PipelineDataInspector,
  breakpointManager: BreakpointManager,
  timingProfiler: TimingProfiler,
  authManager?: AuthManager,
  amStatusBar?: AMStatusBar,
  amCache?: AMCache,
  assumptionTreeProvider?: AssumptionTreeDataProvider
): void {
  // Register run command
  context.subscriptions.push(registerRunCommand(context, statusBar, configLoader, resultsPanel, comparisonManager, runHistoryManager, pipelineView, pipelineDataInspector, breakpointManager, timingProfiler));

  // Register initialize command
  context.subscriptions.push(registerInitializeCommand(context));

  // Register run cloud command (placeholder)
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.runCloud', () => {
      logger.info('Run in Cloud command invoked (not yet implemented)');
      vscode.window.showInformationMessage(
        'LiveCalc: Cloud execution will be available in a future release'
      );
    })
  );

  // Register open results command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.openResults', () => {
      logger.info('Open Results command invoked');
      resultsPanel.show();
    })
  );

  // Register open pipeline view command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.openPipelineView', () => {
      logger.info('Open Pipeline View command invoked');
      pipelineView.show();
    })
  );

  // Register show output command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.showOutput', () => {
      logger.show();
    })
  );

  // Register clear output command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.clearOutput', () => {
      logger.clear();
      vscode.window.showInformationMessage('LiveCalc: Output channel cleared');
    })
  );

  // Register toggle auto-run command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.toggleAutoRun', async () => {
      await autoRunController.toggle();
      const enabled = autoRunController.isEnabled();
      statusBar.setAutoRunEnabled(enabled);
      logger.info(`Auto-run ${enabled ? 'enabled' : 'disabled'}`);
      vscode.window.showInformationMessage(
        `LiveCalc: Auto-run ${enabled ? 'enabled' : 'disabled'}`
      );
    })
  );

  // Register toggle comparison command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.toggleComparison', async () => {
      const config = vscode.workspace.getConfiguration('livecalc');
      const currentValue = config.get<boolean>('showComparison', true);
      const newValue = !currentValue;
      await config.update('showComparison', newValue, vscode.ConfigurationTarget.Global);
      logger.info(`Comparison mode ${newValue ? 'enabled' : 'disabled'}`);
      vscode.window.showInformationMessage(
        `LiveCalc: Comparison ${newValue ? 'enabled' : 'disabled'}`
      );
      // Update results panel if visible
      if (newValue) {
        // Re-send comparison data
        const panelState = resultsPanel.getState();
        if (panelState.type === 'results') {
          const comparison = comparisonManager.calculateComparison(panelState.results);
          const info = comparisonManager.getComparisonInfo();
          resultsPanel.setComparison(comparison, info);
        }
      } else {
        // Hide comparison
        resultsPanel.setComparison(null, null);
      }
    })
  );

  // Register clear comparison command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.clearComparison', async () => {
      await comparisonManager.clearComparison();
      resultsPanel.setComparison(null, null);
      resultsPanel.setComparisonBaseline(null);
      logger.info('Comparison cleared');
      vscode.window.showInformationMessage('LiveCalc: Comparison baseline cleared');
    })
  );

  // Register export history command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.exportHistory', async () => {
      if (runHistoryManager.isEmpty) {
        vscode.window.showWarningMessage('LiveCalc: No run history to export');
        return;
      }

      const csv = runHistoryManager.exportDetailedToCsv();
      const defaultUri = vscode.Uri.file(`livecalc-history-${new Date().toISOString().slice(0, 10)}.csv`);

      const uri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: {
          'CSV files': ['csv'],
          'All files': ['*'],
        },
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, 'utf-8'));
        logger.info(`History exported to ${uri.fsPath}`);
        vscode.window.showInformationMessage(`LiveCalc: History exported to ${uri.fsPath}`);
      }
    })
  );

  // Register clear history command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.clearHistory', () => {
      runHistoryManager.clear();
      resultsPanel.setHistory([]);
      logger.info('Run history cleared');
      vscode.window.showInformationMessage('LiveCalc: Run history cleared');
    })
  );

  // Register pause auto-run command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.pauseAutoRun', () => {
      if (autoRunController.isPaused()) {
        vscode.window.showInformationMessage('LiveCalc: Auto-run is already paused');
        return;
      }
      autoRunController.pause();
      vscode.window.showInformationMessage('LiveCalc: Auto-run paused. Changes will be tracked until resumed.');
    })
  );

  // Register resume auto-run command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.resumeAutoRun', async () => {
      if (!autoRunController.isPaused()) {
        vscode.window.showInformationMessage('LiveCalc: Auto-run is not paused');
        return;
      }
      const pendingCount = autoRunController.getPausedPendingChangeCount();
      await autoRunController.resume();
      if (pendingCount > 0) {
        vscode.window.showInformationMessage(`LiveCalc: Auto-run resumed. Running ${pendingCount} pending change(s)...`);
      } else {
        vscode.window.showInformationMessage('LiveCalc: Auto-run resumed');
      }
    })
  );

  // Register toggle pause command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.togglePause', async () => {
      const wasPaused = autoRunController.isPaused();
      await autoRunController.togglePause();
      if (wasPaused) {
        const pendingCount = autoRunController.getPausedPendingChangeCount();
        if (pendingCount > 0) {
          vscode.window.showInformationMessage(`LiveCalc: Auto-run resumed. Running ${pendingCount} pending change(s)...`);
        } else {
          vscode.window.showInformationMessage('LiveCalc: Auto-run resumed');
        }
      } else {
        vscode.window.showInformationMessage('LiveCalc: Auto-run paused. Changes will be tracked until resumed.');
      }
    })
  );

  // Register Assumptions Manager commands
  if (authManager) {
    // Login command
    context.subscriptions.push(
      vscode.commands.registerCommand('livecalc.amLogin', async () => {
        await executeAMLogin(authManager);
      })
    );

    // Logout command
    context.subscriptions.push(
      vscode.commands.registerCommand('livecalc.amLogout', async () => {
        await executeAMLogout(authManager);
      })
    );

    // Clear cache command
    context.subscriptions.push(
      vscode.commands.registerCommand('livecalc.amClearCache', async () => {
        await executeAMClearCache(amCache);
      })
    );

    // Refresh command - refreshes the tree view
    context.subscriptions.push(
      vscode.commands.registerCommand('livecalc.amRefresh', async () => {
        logger.info('AM Refresh command invoked');
        if (assumptionTreeProvider) {
          assumptionTreeProvider.clearCache();
          assumptionTreeProvider.refresh();
        }
        vscode.window.showInformationMessage('LiveCalc: Assumptions list refreshed');
      })
    );

    // Quick actions command (for status bar click)
    if (amStatusBar) {
      context.subscriptions.push(
        vscode.commands.registerCommand('livecalc.amQuickActions', async () => {
          await amStatusBar.showQuickActions();
        })
      );
    }

    // Insert reference command - inserts assumption reference at cursor
    context.subscriptions.push(
      vscode.commands.registerCommand('livecalc.amInsertReference', async (tableName?: string, version?: string) => {
        if (!tableName || !version) {
          logger.warn('amInsertReference called without table name or version');
          return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('No active editor to insert reference');
          return;
        }

        const reference = `assumptions://${tableName}:${version}`;
        await editor.edit((editBuilder) => {
          editBuilder.insert(editor.selection.active, reference);
        });

        logger.info(`Inserted assumption reference: ${reference}`);
      })
    );

    // Copy reference command - copies assumption reference to clipboard
    context.subscriptions.push(
      vscode.commands.registerCommand('livecalc.amCopyReference', async (item?: AssumptionTreeItem) => {
        let tableName: string | undefined;
        let version: string | undefined;

        if (item && item.data.type === 'version') {
          tableName = item.data.tableName;
          version = item.data.version?.version;
        }

        if (!tableName || !version) {
          logger.warn('amCopyReference called without valid item');
          return;
        }

        const reference = `assumptions://${tableName}:${version}`;
        await vscode.env.clipboard.writeText(reference);
        vscode.window.showInformationMessage(`Copied: ${reference}`);
        logger.info(`Copied assumption reference to clipboard: ${reference}`);
      })
    );

    // Open in browser command - opens table/version in Assumptions Manager
    context.subscriptions.push(
      vscode.commands.registerCommand('livecalc.amOpenInBrowser', async (item?: AssumptionTreeItem) => {
        const config = authManager.getConfig();
        if (!config.url) {
          vscode.window.showWarningMessage('Assumptions Manager URL not configured');
          return;
        }

        let url = config.url;

        if (item) {
          if (item.data.type === 'table' && item.data.table) {
            url = `${config.url}/tables/${item.data.table.id}`;
          } else if (item.data.type === 'version' && item.data.tableName && item.data.version) {
            // Try to get the table ID
            try {
              const client = AssumptionsManagerClient.getInstance(authManager);
              const tableId = await client.getTableId(item.data.tableName);
              url = `${config.url}/tables/${tableId}/versions/${item.data.version.version}`;
            } catch {
              // Fallback to search
              url = `${config.url}/tables?search=${encodeURIComponent(item.data.tableName)}`;
            }
          }
        }

        await vscode.env.openExternal(vscode.Uri.parse(url));
        logger.info(`Opened Assumptions Manager: ${url}`);
      })
    );

    // View data command - shows table data preview
    context.subscriptions.push(
      vscode.commands.registerCommand('livecalc.amViewData', async (item?: AssumptionTreeItem) => {
        if (!item || item.data.type !== 'version' || !item.data.tableName || !item.data.version) {
          vscode.window.showWarningMessage('Please select a version to view data');
          return;
        }

        const tableName = item.data.tableName;
        const version = item.data.version.version;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Loading ${tableName}:${version}...`,
            cancellable: false,
          },
          async () => {
            try {
              const client = AssumptionsManagerClient.getInstance(authManager);
              const data = await client.fetchData(tableName, version);

              // Create a preview document with the data
              const content = formatTableDataForPreview(data.columns, data.rows);
              const doc = await vscode.workspace.openTextDocument({
                content,
                language: 'plaintext',
              });
              await vscode.window.showTextDocument(doc, { preview: true });

              logger.info(`Loaded data preview for ${tableName}:${version}`);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              vscode.window.showErrorMessage(`Failed to load data: ${message}`);
              logger.error(`Failed to load data for ${tableName}:${version}`, error instanceof Error ? error : undefined);
            }
          }
        );
      })
    );

    // Filter tables command - shows filter input
    context.subscriptions.push(
      vscode.commands.registerCommand('livecalc.amFilterTables', async () => {
        const filter = await vscode.window.showInputBox({
          prompt: 'Filter tables by name, description, or type',
          placeHolder: 'e.g., mortality, lapse, v2.0',
          value: '',
        });

        if (filter !== undefined && assumptionTreeProvider) {
          assumptionTreeProvider.setFilter(filter);
          logger.debug(`Filter set to: "${filter}"`);
        }
      })
    );
  }

  logger.debug('All commands registered');
}

/**
 * Format table data for preview display
 */
function formatTableDataForPreview(columns: string[], rows: (string | number)[][]): string {
  if (!columns.length || !rows.length) {
    return 'No data available';
  }

  // Calculate column widths
  const widths: number[] = columns.map((col) => col.length);
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cellStr = String(row[i]);
      if (cellStr.length > widths[i]) {
        widths[i] = cellStr.length;
      }
    }
  }

  // Cap widths at a reasonable max
  const maxWidth = 20;
  const cappedWidths = widths.map((w) => Math.min(w, maxWidth));

  // Build header
  const header = columns.map((col, i) => col.padEnd(cappedWidths[i])).join(' | ');
  const separator = cappedWidths.map((w) => '-'.repeat(w)).join('-+-');

  // Build rows (limit to first 100 rows for preview)
  const maxRows = 100;
  const dataRows = rows.slice(0, maxRows).map((row) =>
    row.map((cell, i) => {
      const str = String(cell);
      return str.length > cappedWidths[i] ? str.slice(0, cappedWidths[i] - 1) + '…' : str.padEnd(cappedWidths[i]);
    }).join(' | ')
  );

  let content = `${header}\n${separator}\n${dataRows.join('\n')}`;

  if (rows.length > maxRows) {
    content += `\n\n... and ${rows.length - maxRows} more rows`;
  }

  return content;
}
