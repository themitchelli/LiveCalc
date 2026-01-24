/**
 * Assumptions Manager Status Bar
 * Shows connection status to Assumptions Manager in VS Code status bar
 */

import * as vscode from 'vscode';
import { AMConnectionState, AMUserInfo } from './types';
import { AuthManager } from './auth';
import { logger } from '../logging/logger';

/**
 * Status bar icons for each connection state
 */
const STATUS_ICONS: Record<AMConnectionState, string> = {
  connected: '$(cloud)',
  disconnected: '$(cloud-offline)',
  error: '$(cloud-error)',
  offline: '$(cloud-download)', // Using download to suggest "cached"
};

/**
 * Status bar colors for each connection state
 */
const STATUS_COLORS: Record<AMConnectionState, vscode.ThemeColor | undefined> = {
  connected: undefined, // Default color (theme-appropriate)
  disconnected: new vscode.ThemeColor('statusBarItem.warningForeground'),
  error: new vscode.ThemeColor('statusBarItem.errorForeground'),
  offline: new vscode.ThemeColor('statusBarItem.warningForeground'),
};

/**
 * Quick action menu items
 */
interface QuickAction {
  label: string;
  description?: string;
  action: () => Promise<void>;
}

/**
 * AMStatusBar displays Assumptions Manager connection status
 * - Separate status bar item from main LiveCalc status
 * - Shows connection state with appropriate icon
 * - Click to open quick actions menu
 */
export class AMStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private authManager: AuthManager;
  private disposables: vscode.Disposable[] = [];
  private currentState: AMConnectionState = 'disconnected';
  private currentUser: AMUserInfo | undefined;

  constructor(authManager: AuthManager) {
    this.authManager = authManager;

    // Create status bar item (lower priority than main LiveCalc status bar)
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99 // Slightly lower priority than main status bar (100)
    );
    this.statusBarItem.command = 'livecalc.amQuickActions';

    // Subscribe to auth events
    this.disposables.push(
      authManager.onDidLogin((user) => {
        this.currentUser = user;
        this.updateStatus('connected');
      }),
      authManager.onDidLogout(() => {
        this.currentUser = undefined;
        this.updateStatus('disconnected');
      }),
      authManager.onDidChangeState((state) => {
        this.updateStatus(state);
      })
    );

    // Initialize with current state
    this.currentState = authManager.getConnectionState();
    this.currentUser = authManager.getUser();
    this.updateStatus(this.currentState);
  }

  /**
   * Update status bar display based on connection state
   */
  private updateStatus(state: AMConnectionState): void {
    this.currentState = state;

    const icon = STATUS_ICONS[state];
    const color = STATUS_COLORS[state];

    // Build status text
    let text = `${icon} AM`;
    if (state === 'offline') {
      text = `${icon} AM (Cached)`;
    }

    this.statusBarItem.text = text;
    this.statusBarItem.color = color;
    this.statusBarItem.backgroundColor = state === 'error'
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : undefined;

    // Build tooltip
    this.statusBarItem.tooltip = this.buildTooltip();

    logger.debug(`AMStatusBar: Updated to ${state}`);
  }

  /**
   * Build detailed tooltip markdown
   */
  private buildTooltip(): vscode.MarkdownString {
    const lines: string[] = [];

    // Header based on state
    switch (this.currentState) {
      case 'connected':
        lines.push('**$(cloud) Assumptions Manager: Connected**');
        if (this.currentUser) {
          lines.push(`\nLogged in as: ${this.currentUser.email}`);
          if (this.currentUser.tenantName) {
            lines.push(`Tenant: ${this.currentUser.tenantName}`);
          }
        }
        break;

      case 'disconnected':
        lines.push('**$(cloud-offline) Assumptions Manager: Disconnected**');
        lines.push('\n_Click to login_');
        break;

      case 'error':
        lines.push('**$(cloud-error) Assumptions Manager: Error**');
        lines.push('\n_Click to view options_');
        break;

      case 'offline':
        lines.push('**$(cloud-download) Assumptions Manager: Offline**');
        lines.push('\nUsing cached assumption data');
        if (this.currentUser) {
          lines.push(`\nLast logged in as: ${this.currentUser.email}`);
        }
        break;
    }

    lines.push('\n---');
    lines.push('_Click to open actions menu_');

    return new vscode.MarkdownString(lines.join('\n'));
  }

  /**
   * Show quick actions menu
   */
  public async showQuickActions(): Promise<void> {
    const actions = this.getQuickActions();

    const selected = await vscode.window.showQuickPick(
      actions.map(a => ({
        label: a.label,
        description: a.description,
        action: a.action,
      })),
      {
        placeHolder: 'Assumptions Manager Actions',
      }
    );

    if (selected) {
      try {
        await selected.action();
      } catch (error) {
        logger.error('AMStatusBar: Quick action failed', error instanceof Error ? error : undefined);
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Assumptions Manager: ${message}`);
      }
    }
  }

  /**
   * Get available quick actions based on current state
   */
  private getQuickActions(): QuickAction[] {
    const actions: QuickAction[] = [];

    if (!this.authManager.isConfigured()) {
      actions.push({
        label: '$(gear) Configure Assumptions Manager',
        description: 'Set API URL in settings',
        action: async () => {
          await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'livecalc.assumptionsManager.url'
          );
        },
      });
      return actions;
    }

    if (this.currentState === 'connected') {
      actions.push({
        label: '$(refresh) Refresh Connection',
        description: 'Check connection status',
        action: async () => {
          // Trigger a connection check via token refresh
          await this.authManager.getToken();
          vscode.window.showInformationMessage('Assumptions Manager: Connection verified');
        },
      });

      actions.push({
        label: '$(sign-out) Logout',
        description: `Sign out from ${this.currentUser?.email || 'Assumptions Manager'}`,
        action: async () => {
          await vscode.commands.executeCommand('livecalc.amLogout');
        },
      });

      actions.push({
        label: '$(trash) Clear Cache',
        description: 'Clear locally cached assumptions',
        action: async () => {
          await vscode.commands.executeCommand('livecalc.amClearCache');
        },
      });

      actions.push({
        label: '$(link-external) Open in Browser',
        description: 'Open Assumptions Manager in web browser',
        action: async () => {
          const config = this.authManager.getConfig();
          await vscode.env.openExternal(vscode.Uri.parse(config.url));
        },
      });
    } else {
      actions.push({
        label: '$(sign-in) Login',
        description: 'Sign in to Assumptions Manager',
        action: async () => {
          await vscode.commands.executeCommand('livecalc.amLogin');
        },
      });

      if (this.currentState === 'offline') {
        actions.push({
          label: '$(refresh) Retry Connection',
          description: 'Try to reconnect to server',
          action: async () => {
            await this.authManager.initialize();
          },
        });
      }
    }

    actions.push({
      label: '$(gear) Settings',
      description: 'Open Assumptions Manager settings',
      action: async () => {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'livecalc.assumptionsManager'
        );
      },
    });

    return actions;
  }

  /**
   * Show the status bar item
   */
  public show(): void {
    // Only show if AM is configured
    if (this.authManager.isConfigured()) {
      this.statusBarItem.show();
    }
  }

  /**
   * Hide the status bar item
   */
  public hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * Get current connection state
   */
  public getState(): AMConnectionState {
    return this.currentState;
  }

  /**
   * Get current user
   */
  public getUser(): AMUserInfo | undefined {
    return this.currentUser;
  }

  public dispose(): void {
    this.statusBarItem.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
