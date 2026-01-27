/**
 * Assumptions Manager Configuration Command
 * Guides users through AM setup: URL configuration → login
 */

import * as vscode from 'vscode';
import { AuthManager } from '../assumptions-manager';
import { logger } from '../logging/logger';
import { executeAMLogin } from './am-login';

/**
 * Execute configure command
 * Guides user through AM configuration wizard
 */
export async function executeAMConfigure(authManager: AuthManager): Promise<void> {
  logger.info('AM Configure: Starting configuration wizard');

  // Step 1: Check if AM URL is configured
  const config = vscode.workspace.getConfiguration('livecalc.assumptionsManager');
  const currentUrl = config.get<string>('url');

  if (!currentUrl) {
    // URL not configured - guide user through setup
    const setupAction = await vscode.window.showInformationMessage(
      'Configure Assumptions Manager to use centralized assumption tables',
      { modal: true, detail: 'You will need:\n1. Assumptions Manager URL\n2. Login credentials\n\nThe URL is typically provided by your IT administrator or actuarial platform team.' },
      'Continue',
      'Cancel'
    );

    if (setupAction !== 'Continue') {
      return;
    }

    // Get AM URL from user
    const url = await vscode.window.showInputBox({
      prompt: 'Enter the Assumptions Manager URL',
      placeHolder: 'https://assumptions-manager.example.com',
      title: 'Configure Assumptions Manager',
      validateInput: (value) => {
        if (!value) {
          return 'URL is required';
        }
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
          return 'URL must start with http:// or https://';
        }
        return undefined;
      },
    });

    if (!url) {
      return;
    }

    // Save URL to settings
    await config.update('url', url, vscode.ConfigurationTarget.Global);
    logger.info(`AM Configure: URL configured: ${url}`);

    vscode.window.showInformationMessage(
      `Assumptions Manager URL configured: ${url}`
    );
  } else {
    // URL already configured
    const action = await vscode.window.showInformationMessage(
      `Assumptions Manager is configured at ${currentUrl}`,
      'Change URL',
      'Continue'
    );

    if (action === 'Change URL') {
      // Allow changing URL
      const newUrl = await vscode.window.showInputBox({
        prompt: 'Enter the new Assumptions Manager URL',
        value: currentUrl,
        title: 'Configure Assumptions Manager',
        validateInput: (value) => {
          if (!value) {
            return 'URL is required';
          }
          if (!value.startsWith('http://') && !value.startsWith('https://')) {
            return 'URL must start with http:// or https://';
          }
          return undefined;
        },
      });

      if (newUrl && newUrl !== currentUrl) {
        await config.update('url', newUrl, vscode.ConfigurationTarget.Global);
        logger.info(`AM Configure: URL updated: ${newUrl}`);

        vscode.window.showInformationMessage(
          `Assumptions Manager URL updated: ${newUrl}`
        );

        // If user changed URL, logout current session
        if (authManager.isAuthenticated()) {
          await authManager.logout();
          vscode.window.showInformationMessage(
            'Logged out due to URL change. Please log in again.'
          );
        }
      }
    }
  }

  // Step 2: Check authentication status
  if (authManager.isAuthenticated()) {
    const user = authManager.getUser();
    const action = await vscode.window.showInformationMessage(
      `Already logged in as ${user?.email}`,
      'Continue',
      'Logout'
    );

    if (action === 'Logout') {
      await authManager.logout();
      vscode.window.showInformationMessage('Logged out successfully');
    }

    return;
  }

  // Step 3: Guide user to login
  const loginAction = await vscode.window.showInformationMessage(
    'Configuration complete. Would you like to login now?',
    'Login',
    'Later'
  );

  if (loginAction === 'Login') {
    await executeAMLogin(authManager);
  } else {
    vscode.window.showInformationMessage(
      'You can login later using: LiveCalc: Login to Assumptions Manager'
    );
  }
}
