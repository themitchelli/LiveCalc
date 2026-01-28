/**
 * Engine Status Bar Item
 *
 * Shows current execution engine (CPU/GPU) in VS Code status bar.
 */

import * as vscode from 'vscode';
import { getColabClient } from './colab-client';

export class EngineStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100 // Priority
        );
        this.statusBarItem.command = 'livecalc.configureGpuEngine';
        this.disposables.push(this.statusBarItem);

        // Listen for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('livecalc.executionMode') ||
                    e.affectsConfiguration('livecalc.colabApiUrl')) {
                    this.update();
                }
            })
        );

        // Initial update
        this.update();
        this.statusBarItem.show();
    }

    /**
     * Update status bar based on current configuration
     */
    update(): void {
        const config = vscode.workspace.getConfiguration('livecalc');
        const mode = config.get<string>('executionMode', 'cpu');
        const colabUrl = config.get<string>('colabApiUrl', '');

        switch (mode) {
            case 'cpu':
                this.statusBarItem.text = '$(desktop-download) CPU';
                this.statusBarItem.tooltip = 'Execution Mode: CPU (Local WASM)\nClick to configure GPU';
                this.statusBarItem.backgroundColor = undefined;
                break;

            case 'gpu':
                if (colabUrl) {
                    this.statusBarItem.text = '$(server) GPU';
                    this.statusBarItem.tooltip = 'Execution Mode: GPU (Colab)\nClick to test connection';
                    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                } else {
                    this.statusBarItem.text = '$(warning) GPU (Not Configured)';
                    this.statusBarItem.tooltip = 'GPU mode selected but not configured\nClick to configure';
                    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                }
                break;

            case 'both':
                if (colabUrl) {
                    this.statusBarItem.text = '$(layers) CPU + GPU';
                    this.statusBarItem.tooltip = 'Execution Mode: Both (CPU preview, GPU final)\nClick to configure';
                    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                } else {
                    this.statusBarItem.text = '$(warning) Both (GPU Not Configured)';
                    this.statusBarItem.tooltip = 'Both mode selected but GPU not configured\nClick to configure';
                    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                }
                break;
        }
    }

    /**
     * Show connection status temporarily
     */
    showConnectionStatus(connected: boolean): void {
        if (connected) {
            this.statusBarItem.text = '$(check) GPU Connected';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        } else {
            this.statusBarItem.text = '$(x) GPU Disconnected';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }

        // Restore after 3 seconds
        setTimeout(() => {
            this.update();
        }, 3000);
    }

    /**
     * Show reconnecting status
     */
    showReconnecting(): void {
        this.statusBarItem.text = '$(sync~spin) GPU Reconnecting...';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    /**
     * Dispose
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
