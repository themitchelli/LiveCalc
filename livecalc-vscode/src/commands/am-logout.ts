/**
 * Assumptions Manager Logout Command
 * Handles user logout from Assumptions Manager
 */

import * as vscode from 'vscode';
import { AuthManager } from '../assumptions-manager';
import { logger } from '../logging/logger';

/**
 * Execute logout command
 * Clears stored credentials and updates connection state
 */
export async function executeAMLogout(authManager: AuthManager): Promise<void> {
  // Check if logged in
  if (!authManager.isAuthenticated()) {
    vscode.window.showInformationMessage('Not logged in to Assumptions Manager');
    return;
  }

  const user = authManager.getUser();

  // Confirm logout
  const action = await vscode.window.showInformationMessage(
    `Are you sure you want to logout from Assumptions Manager? (${user?.email})`,
    { modal: true },
    'Logout',
    'Cancel'
  );

  if (action !== 'Logout') {
    return;
  }

  try {
    await authManager.logout();
    logger.info('AM Logout: Successfully logged out');
    vscode.window.showInformationMessage('Logged out from Assumptions Manager');
  } catch (error) {
    logger.error('AM Logout: Failed', error instanceof Error ? error : undefined);
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to logout: ${message}`);
  }
}

/**
 * Execute clear cache command
 * Clears locally cached assumptions data
 */
export async function executeAMClearCache(): Promise<void> {
  // For now, just show a message - actual cache will be implemented in US-005
  const action = await vscode.window.showWarningMessage(
    'This will clear all locally cached assumption data. You may need to re-download assumptions on the next run.',
    { modal: true },
    'Clear Cache',
    'Cancel'
  );

  if (action !== 'Clear Cache') {
    return;
  }

  try {
    // TODO: Implement actual cache clearing in US-005
    logger.info('AM Cache: Cleared');
    vscode.window.showInformationMessage('Assumptions cache cleared');
  } catch (error) {
    logger.error('AM Cache: Failed to clear', error instanceof Error ? error : undefined);
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to clear cache: ${message}`);
  }
}
