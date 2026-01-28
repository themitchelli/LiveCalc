/**
 * Configure GPU Engine Command
 *
 * Interactive configuration wizard for setting up Google Colab GPU integration.
 */

import * as vscode from 'vscode';
import { ColabClient } from '../gpu/colab-client';

export async function configureGpuEngine(): Promise<void> {
    const config = vscode.workspace.getConfiguration('livecalc');

    // Step 1: Welcome message
    const proceed = await vscode.window.showInformationMessage(
        'Configure GPU Engine for LiveCalc',
        {
            modal: true,
            detail: 'This wizard will help you set up Google Colab GPU integration for faster projections.\n\n' +
                'Prerequisites:\n' +
                '• Google Colab notebook running (colab_api_server.ipynb)\n' +
                '• ngrok tunnel active\n' +
                '• Public URL from ngrok output\n\n' +
                'Continue with setup?'
        },
        'Continue',
        'Cancel'
    );

    if (proceed !== 'Continue') {
        return;
    }

    // Step 2: Get Colab API URL
    const currentUrl = config.get<string>('colabApiUrl', '');
    const apiUrl = await vscode.window.showInputBox({
        prompt: 'Enter Colab API URL from ngrok',
        placeHolder: 'https://abc123.ngrok.io',
        value: currentUrl,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'URL is required';
            }
            if (!value.startsWith('http://') && !value.startsWith('https://')) {
                return 'URL must start with http:// or https://';
            }
            return null;
        }
    });

    if (!apiUrl) {
        return; // User cancelled
    }

    // Step 3: Test connection
    const testingMessage = vscode.window.setStatusBarMessage('$(sync~spin) Testing connection to Colab...');

    try {
        const client = new ColabClient(apiUrl);
        const health = await client.checkHealth();

        testingMessage.dispose();

        // Show success
        const result = await vscode.window.showInformationMessage(
            `✅ Connected to Colab GPU!`,
            {
                modal: true,
                detail: `GPU: ${health.gpu_model}\n` +
                    `Memory: ${health.gpu_memory_gb.toFixed(2)} GB\n` +
                    `Compute Capability: ${health.compute_capability}\n` +
                    `Active Jobs: ${health.active_jobs}\n\n` +
                    `Save this configuration?`
            },
            'Save',
            'Cancel'
        );

        if (result === 'Save') {
            // Save configuration
            await config.update('colabApiUrl', apiUrl, vscode.ConfigurationTarget.Workspace);

            // Ask about execution mode
            const mode = await vscode.window.showQuickPick(
                [
                    {
                        label: 'CPU (Local)',
                        description: 'Use local WASM engine (default)',
                        value: 'cpu'
                    },
                    {
                        label: 'GPU (Colab)',
                        description: '2-3x faster for large datasets',
                        value: 'gpu'
                    },
                    {
                        label: 'Both',
                        description: 'CPU first (preview), then GPU (final)',
                        value: 'both'
                    }
                ],
                {
                    placeHolder: 'Select execution mode',
                    title: 'Execution Mode'
                }
            );

            if (mode) {
                await config.update('executionMode', mode.value, vscode.ConfigurationTarget.Workspace);
            }

            // Start health checks
            const healthCheckInterval = config.get<number>('colabHealthCheckInterval', 300000);
            client.startHealthChecks(healthCheckInterval, () => {
                vscode.window.showWarningMessage('Colab GPU connection lost. Check if notebook is still running.');
            });

            vscode.window.showInformationMessage('✅ GPU engine configured successfully!');
        }

    } catch (error: any) {
        testingMessage.dispose();

        vscode.window.showErrorMessage(
            `Failed to connect to Colab: ${error.message}`,
            {
                modal: true,
                detail: 'Common issues:\n' +
                    '• Colab notebook not running\n' +
                    '• ngrok tunnel not active\n' +
                    '• Incorrect URL\n' +
                    '• Firewall blocking connection\n\n' +
                    'Check the Colab notebook output for the correct URL.'
            },
            'Open Setup Guide'
        ).then(action => {
            if (action === 'Open Setup Guide') {
                vscode.env.openExternal(vscode.Uri.parse(
                    'https://github.com/themitchelli/LiveCalc/blob/main/livecalc-engines/gpu/COLAB_SETUP.md'
                ));
            }
        });
    }
}

export async function testGpuConnection(): Promise<void> {
    const config = vscode.workspace.getConfiguration('livecalc');
    const apiUrl = config.get<string>('colabApiUrl', '');

    if (!apiUrl) {
        vscode.window.showWarningMessage(
            'GPU not configured. Run "Configure GPU Engine" first.',
            'Configure Now'
        ).then(action => {
            if (action === 'Configure Now') {
                configureGpuEngine();
            }
        });
        return;
    }

    const testingMessage = vscode.window.setStatusBarMessage('$(sync~spin) Testing Colab connection...');

    try {
        const client = new ColabClient(apiUrl);
        const health = await client.checkHealth();

        testingMessage.dispose();

        const uptime = client.getLastHealthCheck();
        const uptimeStr = uptime ? new Date(uptime).toLocaleTimeString() : 'Unknown';

        vscode.window.showInformationMessage(
            `✅ Colab GPU Connected`,
            {
                modal: true,
                detail: `GPU: ${health.gpu_model}\n` +
                    `Memory: ${health.gpu_memory_gb.toFixed(2)} GB\n` +
                    `Compute Capability: ${health.compute_capability}\n` +
                    `Active Jobs: ${health.active_jobs}\n` +
                    `Total Jobs: ${health.total_jobs}\n` +
                    `Last Check: ${uptimeStr}`
            },
            'OK'
        );

    } catch (error: any) {
        testingMessage.dispose();

        vscode.window.showErrorMessage(
            `❌ Colab Connection Failed: ${error.message}`,
            {
                modal: true,
                detail: 'The Colab server is not responding. Check:\n' +
                    '• Notebook is still running\n' +
                    '• ngrok tunnel is active\n' +
                    '• URL in settings is correct\n\n' +
                    'You may need to restart the notebook and update the URL.'
            },
            'Reconfigure',
            'Open Setup Guide'
        ).then(action => {
            if (action === 'Reconfigure') {
                configureGpuEngine();
            } else if (action === 'Open Setup Guide') {
                vscode.env.openExternal(vscode.Uri.parse(
                    'https://github.com/themitchelli/LiveCalc/blob/main/livecalc-engines/gpu/COLAB_SETUP.md'
                ));
            }
        });
    }
}
