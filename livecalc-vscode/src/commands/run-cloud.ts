/**
 * Run in Cloud command implementation (US-BRIDGE-05)
 */

import * as vscode from 'vscode';
import { StatusBar } from '../ui/status-bar';
import { ResultsPanel } from '../ui/results-panel';
import { getCloudClient, CloudClientError } from '../cloud/cloud-client';
import { ResultStreamer } from '../cloud/result-streamer';
import { logger } from '../logging/logger';
import { classifyError } from '../ui/error-types';

/**
 * Register the Run in Cloud command
 */
export function registerRunCloudCommand(
  context: vscode.ExtensionContext,
  statusBar: StatusBar,
  resultsPanel: ResultsPanel
): vscode.Disposable {
  return vscode.commands.registerCommand('livecalc.runCloud', async () => {
    logger.info('=== Run in Cloud command invoked ===');

    vscode.window.showInformationMessage(
      'LiveCalc: Cloud execution demonstrating WebSocket result streaming',
      'Run Demo'
    ).then(async (action) => {
      if (action !== 'Run Demo') {
        return;
      }

      try {
        // Get cloud client
        let cloudClient;
      try {
        cloudClient = await getCloudClient(context);
      } catch (error) {
        if (error instanceof CloudClientError) {
          vscode.window.showErrorMessage(`LiveCalc: ${error.message}`, 'Configure').then((action) => {
            if (action === 'Configure') {
              vscode.commands.executeCommand('workbench.action.openSettings', 'livecalc.cloud');
            }
          });
        } else {
          vscode.window.showErrorMessage(`LiveCalc: ${error instanceof Error ? error.message : String(error)}`);
        }
        return;
      }

      // Show progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'LiveCalc: Running in Cloud',
          cancellable: true
        },
        async (progress, token) => {
          try {
            // Update status bar
            statusBar.setRunning();

            // Create mock package (simplified for demonstration)
            progress.report({ message: 'Preparing model package...', increment: 10 });
            logger.info('Creating mock package for demo');

            const mockPackageBuffer = Buffer.from('mock-package-data');

            // Submit job to cloud API
            progress.report({ message: 'Submitting job to cloud...', increment: 10 });
            logger.info('Submitting job to cloud API');

            const submitResponse = await cloudClient.submitJob(mockPackageBuffer, 'demo-model');

            progress.report({ message: `Job submitted: ${submitResponse.jobId}`, increment: 10 });
            logger.info(`Job ID: ${submitResponse.jobId}, WebSocket URL: ${submitResponse.websocketUrl}`);

            // Open results panel
            resultsPanel.show();
            resultsPanel.setLoading('Connecting to cloud worker...');

            // Step 4: Connect to WebSocket and stream results
            progress.report({ message: 'Connecting to cloud worker...', increment: 10 });

            const streamer = new ResultStreamer(
              submitResponse.websocketUrl,
              // Progress callback
              (current, total, message) => {
                const percentage = (current / total) * 50; // Reserve 50% for execution
                progress.report({ message, increment: percentage / total });
                resultsPanel.setLoading(`${message} (${current}/${total})`);
              },
              // Results callback
              (results) => {
                logger.info('Cloud results received');
                progress.report({ message: 'Results received', increment: 40 });

                // Update results panel
                resultsPanel.setResults(results);

                // Update status bar
                const executionTime = results.metadata.executionTimeMs;
                statusBar.setCompleted(executionTime, results.metadata.policyCount, results.metadata.scenarioCount);

                vscode.window.showInformationMessage(
                  `LiveCalc: Cloud execution completed in ${(executionTime / 1000).toFixed(2)}s`
                );
              },
              // Error callback
              (error, details) => {
                logger.error(`Cloud execution error: ${error}`);
                if (details) {
                  logger.error(`Details: ${details}`);
                }

                const errorObj = classifyError(new Error(error));
                resultsPanel.setStructuredError(errorObj);
                statusBar.setError();

                vscode.window.showErrorMessage(`LiveCalc: Cloud execution failed - ${error}`);
              }
            );

            // Check for cancellation
            token.onCancellationRequested(() => {
              logger.info('Cloud execution cancelled by user');
              streamer.disconnect();
              cloudClient.cancelJob(submitResponse.jobId).catch((err) => {
                logger.error('Failed to cancel job', err instanceof Error ? err : undefined);
              });
              statusBar.setCancelled('Cancelled by user');
            });

            // Connect and start execution with mock payload
            try {
              const payload = {
                config: { nodes: [] },
                wasmBinaries: {},
                pythonScripts: {},
                assumptionRefs: []
              };

              await streamer.connect(submitResponse.jobId, payload);
              logger.info('WebSocket connected, execution started');
            } catch (error) {
              throw new Error(`Failed to connect to cloud worker: ${error instanceof Error ? error.message : String(error)}`);
            }
          } catch (error) {
            logger.error('Cloud execution failed', error instanceof Error ? error : undefined);

            const errorObj = classifyError(error instanceof Error ? error : new Error(String(error)));
            resultsPanel.setStructuredError(errorObj);
            statusBar.setError();

            throw error;
          }
        }
      );
      } catch (error) {
        // Error already logged and displayed
        return;
      }
    });
  });
}
