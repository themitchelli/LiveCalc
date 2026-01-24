import * as vscode from 'vscode';

/**
 * Show a notification message
 * Utility function for simple notifications
 */
export function showNotification(
  type: 'info' | 'warning' | 'error',
  message: string
): void {
  const fullMessage = `LiveCalc: ${message}`;
  switch (type) {
    case 'info':
      vscode.window.showInformationMessage(fullMessage);
      break;
    case 'warning':
      vscode.window.showWarningMessage(fullMessage);
      break;
    case 'error':
      vscode.window.showErrorMessage(fullMessage);
      break;
  }
}

/**
 * Notification helpers for LiveCalc
 */
export class Notifications {
  /**
   * Show information message
   */
  public static info(message: string): void {
    vscode.window.showInformationMessage(`LiveCalc: ${message}`);
  }

  /**
   * Show warning message
   */
  public static warn(message: string): void {
    vscode.window.showWarningMessage(`LiveCalc: ${message}`);
  }

  /**
   * Show error message with optional "Show Output" action
   */
  public static async error(message: string, showOutputAction = true): Promise<void> {
    const actions = showOutputAction ? ['Show Output'] : [];
    const action = await vscode.window.showErrorMessage(`LiveCalc: ${message}`, ...actions);
    if (action === 'Show Output') {
      vscode.commands.executeCommand('livecalc.showOutput');
    }
  }

  /**
   * Show completion message with execution time
   */
  public static completed(timeMs: number, policyCount?: number, scenarioCount?: number): void {
    const timeStr = timeMs >= 1000 ? `${(timeMs / 1000).toFixed(2)}s` : `${Math.round(timeMs)}ms`;
    let message = `Completed in ${timeStr}`;
    if (policyCount && scenarioCount) {
      message += ` (${policyCount.toLocaleString()} policies x ${scenarioCount.toLocaleString()} scenarios)`;
    }
    vscode.window.showInformationMessage(`LiveCalc: ${message}`);
  }

  /**
   * Show message that config file is missing
   */
  public static async noConfigFile(): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'LiveCalc: No livecalc.config.json found in workspace',
      'Initialize Project'
    );
    if (action === 'Initialize Project') {
      vscode.commands.executeCommand('livecalc.initialize');
    }
  }
}
