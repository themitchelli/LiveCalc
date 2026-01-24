import * as vscode from 'vscode';
import { registerRunCommand } from './run';
import { registerInitializeCommand } from './initialize';
import { StatusBar } from '../ui/status-bar';
import { ConfigLoader } from '../config/config-loader';
import { logger } from '../logging/logger';

/**
 * Register all LiveCalc commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  statusBar: StatusBar,
  configLoader: ConfigLoader
): void {
  // Register run command
  context.subscriptions.push(registerRunCommand(context, statusBar, configLoader));

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

  // Register open results command (placeholder for PRD-LC-004)
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.openResults', () => {
      logger.info('Open Results command invoked (not yet implemented)');
      vscode.window.showInformationMessage(
        'LiveCalc: Results panel will be available in a future release'
      );
    })
  );

  // Register show output command
  context.subscriptions.push(
    vscode.commands.registerCommand('livecalc.showOutput', () => {
      logger.show();
    })
  );

  logger.debug('All commands registered');
}
