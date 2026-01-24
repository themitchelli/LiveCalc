/**
 * Assumptions Manager Login Command
 * Handles user authentication with Assumptions Manager
 */

import * as vscode from 'vscode';
import { AuthManager, AMAuthError, AMCredentials } from '../assumptions-manager';
import { logger } from '../logging/logger';

/**
 * Login method selection
 */
type LoginMethod = 'credentials' | 'browser';

/**
 * Execute login command
 * Shows login options and authenticates with Assumptions Manager
 */
export async function executeAMLogin(authManager: AuthManager): Promise<void> {
  // Check if AM is configured
  if (!authManager.isConfigured()) {
    const action = await vscode.window.showWarningMessage(
      'Assumptions Manager URL not configured. Would you like to configure it now?',
      'Open Settings',
      'Cancel'
    );

    if (action === 'Open Settings') {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'livecalc.assumptionsManager.url'
      );
    }
    return;
  }

  // Check if already logged in
  if (authManager.isAuthenticated()) {
    const user = authManager.getUser();
    const action = await vscode.window.showInformationMessage(
      `Already logged in as ${user?.email}. Would you like to logout first?`,
      'Logout',
      'Cancel'
    );

    if (action === 'Logout') {
      await authManager.logout();
    } else {
      return;
    }
  }

  // Ask for login method
  const method = await selectLoginMethod();
  if (!method) {
    return;
  }

  if (method === 'browser') {
    await loginViaBrowser(authManager);
  } else {
    await loginWithCredentials(authManager);
  }
}

/**
 * Select login method
 */
async function selectLoginMethod(): Promise<LoginMethod | undefined> {
  const options: vscode.QuickPickItem[] = [
    {
      label: '$(sign-in) Login with Email & Password',
      description: 'Enter credentials directly',
      detail: 'Recommended for most users',
    },
    {
      label: '$(link-external) Login via Browser',
      description: 'Opens browser for authentication',
      detail: 'Use if your organization requires SSO',
    },
  ];

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: 'Select login method',
    title: 'Assumptions Manager Login',
  });

  if (!selected) {
    return undefined;
  }

  return selected.label.includes('Browser') ? 'browser' : 'credentials';
}

/**
 * Login with username/password
 */
async function loginWithCredentials(authManager: AuthManager): Promise<void> {
  // Get email
  const email = await vscode.window.showInputBox({
    prompt: 'Enter your email address',
    placeHolder: 'user@example.com',
    title: 'Assumptions Manager Login',
    validateInput: (value) => {
      if (!value) {
        return 'Email is required';
      }
      if (!value.includes('@')) {
        return 'Please enter a valid email address';
      }
      return undefined;
    },
  });

  if (!email) {
    return;
  }

  // Get password
  const password = await vscode.window.showInputBox({
    prompt: 'Enter your password',
    password: true,
    title: 'Assumptions Manager Login',
    validateInput: (value) => {
      if (!value) {
        return 'Password is required';
      }
      return undefined;
    },
  });

  if (!password) {
    return;
  }

  // Attempt login with progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Logging in to Assumptions Manager...',
      cancellable: false,
    },
    async () => {
      try {
        const credentials: AMCredentials = { email, password };
        const user = await authManager.login(credentials);

        logger.info(`AM Login: Successfully logged in as ${user.email}`);
        vscode.window.showInformationMessage(
          `Logged in to Assumptions Manager as ${user.email}`
        );
      } catch (error) {
        handleLoginError(error);
      }
    }
  );
}

/**
 * Login via browser OAuth flow
 */
async function loginViaBrowser(authManager: AuthManager): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Opening browser for login...',
      cancellable: true,
    },
    async (progress, token) => {
      try {
        progress.report({ message: 'Waiting for authentication...' });

        const loginPromise = authManager.loginViaBrowser();

        // Handle cancellation
        token.onCancellationRequested(() => {
          // Note: We can't really cancel the browser flow, but we can ignore the result
          logger.debug('AM Login: Browser login cancelled by user');
        });

        const user = await loginPromise;

        if (token.isCancellationRequested) {
          // User cancelled, logout silently
          await authManager.logout();
          return;
        }

        logger.info(`AM Login: Browser login successful as ${user.email}`);
        vscode.window.showInformationMessage(
          `Logged in to Assumptions Manager as ${user.email}`
        );
      } catch (error) {
        if (!token.isCancellationRequested) {
          handleLoginError(error);
        }
      }
    }
  );
}

/**
 * Handle login errors with user-friendly messages
 */
function handleLoginError(error: unknown): void {
  logger.error('AM Login: Failed', error instanceof Error ? error : undefined);

  if (error instanceof AMAuthError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        vscode.window.showErrorMessage(
          'Login failed: Invalid email or password. Please try again.'
        );
        break;

      case 'NETWORK_ERROR':
        vscode.window.showErrorMessage(
          'Login failed: Unable to connect to Assumptions Manager. Please check your internet connection and the server URL.',
          'Open Settings'
        ).then((action) => {
          if (action === 'Open Settings') {
            vscode.commands.executeCommand(
              'workbench.action.openSettings',
              'livecalc.assumptionsManager.url'
            );
          }
        });
        break;

      case 'NOT_CONFIGURED':
        vscode.window.showErrorMessage(
          'Login failed: Assumptions Manager URL not configured.',
          'Open Settings'
        ).then((action) => {
          if (action === 'Open Settings') {
            vscode.commands.executeCommand(
              'workbench.action.openSettings',
              'livecalc.assumptionsManager.url'
            );
          }
        });
        break;

      case 'SERVER_ERROR':
        vscode.window.showErrorMessage(
          `Login failed: ${error.message}`
        );
        break;

      default:
        vscode.window.showErrorMessage(
          `Login failed: ${error.message}`
        );
    }
  } else {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Login failed: ${message}`);
  }
}
