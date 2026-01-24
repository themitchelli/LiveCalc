import * as vscode from 'vscode';
import { registerRunCommand } from './run';
import { registerInitializeCommand } from './initialize';
import { StatusBar } from '../ui/status-bar';
import { ConfigLoader } from '../config/config-loader';
import { ResultsPanel } from '../ui/results-panel';
import { ComparisonManager } from '../ui/comparison';
import { AutoRunController } from '../auto-run';
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
  autoRunController: AutoRunController
): void {
  // Register run command
  context.subscriptions.push(registerRunCommand(context, statusBar, configLoader, resultsPanel, comparisonManager));

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

  logger.debug('All commands registered');
}
