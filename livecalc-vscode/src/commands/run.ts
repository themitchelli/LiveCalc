import * as vscode from 'vscode';
import { logger } from '../logging/logger';
import { StatusBar } from '../ui/status-bar';
import { Notifications } from '../ui/notifications';
import { ConfigLoader } from '../config/config-loader';

/**
 * Run command handler
 * Executes the valuation using the WASM engine
 */
export async function runCommand(
  statusBar: StatusBar,
  configLoader: ConfigLoader
): Promise<void> {
  logger.info('Run command invoked');

  // Find config file
  const configPath = await configLoader.findConfigFile();
  if (!configPath) {
    logger.warn('No livecalc.config.json found');
    await Notifications.noConfigFile();
    return;
  }

  // Load and validate config
  const config = await configLoader.loadConfig(configPath);
  if (!config) {
    logger.error('Failed to load config file');
    return;
  }

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

        // TODO: In US-004 and US-006, this will load data and run the WASM engine
        // For now, simulate execution for scaffold validation
        logger.info('Would load data and run valuation here');
        logger.debug(`Config: ${JSON.stringify(config, null, 2)}`);

        // Simulate progress updates
        for (let i = 0; i <= 100; i += 20) {
          if (token.isCancellationRequested) {
            logger.info('Execution cancelled by user');
            statusBar.setReady();
            return;
          }

          progress.report({
            message: `Running valuation... ${i}%`,
            increment: 20,
          });
          statusBar.setProgress(i);

          // Simulate work (remove in actual implementation)
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const elapsed = Date.now() - startTime;
        statusBar.setCompleted(elapsed);
        Notifications.completed(elapsed);
        logger.info(`Valuation completed in ${elapsed}ms`);

        // TODO: Open results panel (PRD-LC-004)
      } catch (error) {
        const elapsed = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
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
