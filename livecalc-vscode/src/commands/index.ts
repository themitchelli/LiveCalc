import * as vscode from 'vscode';
import { registerRunCommand } from './run';
import { registerInitializeCommand } from './initialize';
import { StatusBar } from '../ui/status-bar';
import { ConfigLoader } from '../config/config-loader';
import { ResultsPanel } from '../ui/results-panel';
import { ComparisonManager } from '../ui/comparison';
import { RunHistoryManager } from '../auto-run/run-history';
import { AutoRunController } from '../auto-run';
import { AuthManager, AMStatusBar, AMCache } from '../assumptions-manager';
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
  authManager?: AuthManager,
  amStatusBar?: AMStatusBar,
  amCache?: AMCache
): void {
  // Register run command
  context.subscriptions.push(registerRunCommand(context, statusBar, configLoader, resultsPanel, comparisonManager, runHistoryManager));

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

    // Refresh command (placeholder for US-003)
    context.subscriptions.push(
      vscode.commands.registerCommand('livecalc.amRefresh', async () => {
        logger.info('AM Refresh command invoked');
        // Will trigger tree view refresh in US-008
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
  }

  logger.debug('All commands registered');
}
