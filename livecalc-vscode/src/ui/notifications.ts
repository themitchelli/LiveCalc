import * as vscode from 'vscode';
import { logger } from '../logging/logger';

/**
 * Notification mode setting values
 */
export type NotificationMode = 'none' | 'statusBar' | 'toast' | 'sound';

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
 * Get the notification mode from configuration
 */
function getNotificationMode(): NotificationMode {
  return vscode.workspace.getConfiguration('livecalc').get<NotificationMode>('notifyOnAutoRun', 'statusBar');
}

/**
 * Get whether to notify on errors regardless of mode
 */
function getNotifyOnError(): boolean {
  return vscode.workspace.getConfiguration('livecalc').get<boolean>('notifyOnError', true);
}

/**
 * Play a system notification sound if available
 * Note: VS Code doesn't have a native sound API, but some terminals/systems
 * may respond to the BEL character or we can use accessibility features
 */
async function playNotificationSound(): Promise<void> {
  try {
    // VS Code 1.74+ added env.uiKind check but no direct sound API
    // We can try using the accessibility features or terminal bell
    // For now, this is a best-effort approach

    // Option 1: Try to use VS Code's accessibility announcement which may trigger sound
    // This won't always work but is the closest we have to a portable solution

    // Option 2: On some systems, we could execute a shell command
    // macOS: afplay /System/Library/Sounds/Glass.aiff
    // Windows: powershell -c (New-Object Media.SoundPlayer 'C:\Windows\Media\notify.wav').PlaySync()
    // Linux: paplay /usr/share/sounds/freedesktop/stereo/complete.oga

    const platform = process.platform;
    const terminal = vscode.window.createTerminal({
      name: 'LiveCalc Sound',
      hideFromUser: true,
      isTransient: true,
    });

    if (platform === 'darwin') {
      terminal.sendText('afplay /System/Library/Sounds/Glass.aiff &>/dev/null &', true);
    } else if (platform === 'win32') {
      terminal.sendText('powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\notify.wav\').PlaySync()" 2>$null', true);
    } else {
      // Linux - try freedesktop sound
      terminal.sendText('paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null &', true);
    }

    // Close the terminal after a brief delay
    setTimeout(() => {
      terminal.dispose();
    }, 2000);

    logger.debug('Notification sound triggered');
  } catch {
    // Sound is best-effort, don't fail if it doesn't work
    logger.debug('Failed to play notification sound (platform may not support it)');
  }
}

/**
 * Notification helpers for LiveCalc with configurable notification preferences
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
   * Uses configurable notification mode for auto-runs
   *
   * @param timeMs - Execution time in milliseconds
   * @param policyCount - Number of policies processed
   * @param scenarioCount - Number of scenarios processed
   * @param isAutoRun - Whether this was triggered by auto-run
   */
  public static async completed(
    timeMs: number,
    policyCount?: number,
    scenarioCount?: number,
    isAutoRun: boolean = false
  ): Promise<void> {
    const timeStr = timeMs >= 1000 ? `${(timeMs / 1000).toFixed(2)}s` : `${Math.round(timeMs)}ms`;
    let message = `Completed in ${timeStr}`;
    if (policyCount && scenarioCount) {
      message += ` (${policyCount.toLocaleString()} policies x ${scenarioCount.toLocaleString()} scenarios)`;
    }

    // For manual runs, always show toast
    if (!isAutoRun) {
      vscode.window.showInformationMessage(`LiveCalc: ${message}`);
      return;
    }

    // For auto-runs, respect the notification mode setting
    const mode = getNotificationMode();

    switch (mode) {
      case 'none':
        // Silent - results panel updates but no notification
        logger.debug(`Auto-run completed (silent): ${message}`);
        break;

      case 'statusBar':
        // Status bar shows completion time - this is handled by StatusBar class
        // Just log for debug purposes
        logger.debug(`Auto-run completed (statusBar): ${message}`);
        break;

      case 'toast':
        // Show VS Code notification toast
        vscode.window.showInformationMessage(`LiveCalc: ${message}`);
        break;

      case 'sound':
        // Play sound and show toast
        await playNotificationSound();
        vscode.window.showInformationMessage(`LiveCalc: ${message}`);
        break;
    }
  }

  /**
   * Show error notification respecting user preferences
   * Errors always show toast if notifyOnError is true (default)
   *
   * @param message - Error message
   * @param isAutoRun - Whether this was triggered by auto-run
   * @param showOutputAction - Whether to show "Show Output" action
   */
  public static async errorWithPreferences(
    message: string,
    isAutoRun: boolean = false,
    showOutputAction = true
  ): Promise<void> {
    // For manual runs, always show error
    if (!isAutoRun) {
      await Notifications.error(message, showOutputAction);
      return;
    }

    // For auto-runs, check the notifyOnError setting
    const notifyOnError = getNotifyOnError();

    if (notifyOnError) {
      await Notifications.error(message, showOutputAction);
    } else {
      // Log but don't show notification
      logger.error(`Auto-run error (silent): ${message}`);
    }
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

  /**
   * Get the current notification mode from settings
   */
  public static getNotificationMode(): NotificationMode {
    return getNotificationMode();
  }

  /**
   * Check if error notifications are enabled
   */
  public static isNotifyOnErrorEnabled(): boolean {
    return getNotifyOnError();
  }
}
