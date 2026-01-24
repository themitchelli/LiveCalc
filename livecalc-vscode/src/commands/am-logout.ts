/**
 * Assumptions Manager Logout Command
 * Handles user logout from Assumptions Manager
 */

import * as vscode from 'vscode';
import { AuthManager, AMCache } from '../assumptions-manager';
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
export async function executeAMClearCache(cache?: AMCache): Promise<void> {
  // Check if cache is available
  if (!cache) {
    vscode.window.showInformationMessage('Assumptions cache is not initialized');
    return;
  }

  // Get current stats before clearing
  const stats = cache.getStatistics();
  if (stats.entryCount === 0) {
    vscode.window.showInformationMessage('Assumptions cache is already empty');
    return;
  }

  // Confirm clear
  const sizeStr = formatBytes(stats.totalSizeBytes);
  const action = await vscode.window.showWarningMessage(
    `This will clear ${stats.entryCount} cached assumption${stats.entryCount === 1 ? '' : 's'} (${sizeStr}). ` +
      'You may need to re-download assumptions on the next run.',
    { modal: true },
    'Clear Cache',
    'Cancel'
  );

  if (action !== 'Clear Cache') {
    return;
  }

  try {
    const clearedCount = await cache.clear();
    logger.info(`AM Cache: Cleared ${clearedCount} entries`);
    vscode.window.showInformationMessage(
      `Assumptions cache cleared (${clearedCount} entries removed)`
    );
  } catch (error) {
    logger.error('AM Cache: Failed to clear', error instanceof Error ? error : undefined);
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to clear cache: ${message}`);
  }
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
