import * as vscode from 'vscode';

/**
 * Status bar state for detailed tooltips
 */
interface StatusBarState {
  status: 'ready' | 'running' | 'completed' | 'error';
  lastRunTimeMs?: number;
  lastRunPolicies?: number;
  lastRunScenarios?: number;
  lastError?: string;
  engineInitialized: boolean;
  configPath?: string;
  autoRunEnabled: boolean;
}

/**
 * Status bar integration for LiveCalc
 * Shows extension state and last run time with detailed tooltips
 */
export class StatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private spinnerInterval?: NodeJS.Timeout;
  private spinnerFrames = ['$(sync~spin)', '$(sync~spin)', '$(sync~spin)', '$(sync~spin)'];
  private spinnerIndex = 0;
  private state: StatusBarState = {
    status: 'ready',
    engineInitialized: false,
    autoRunEnabled: true,
  };

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'livecalc.showOutput';
    this.setReady();
  }

  /**
   * Update engine initialization state
   */
  public setEngineInitialized(initialized: boolean): void {
    this.state.engineInitialized = initialized;
    this.updateTooltip();
  }

  /**
   * Update config path for tooltip
   */
  public setConfigPath(configPath: string | undefined): void {
    this.state.configPath = configPath;
    this.updateTooltip();
  }

  /**
   * Update auto-run enabled state
   */
  public setAutoRunEnabled(enabled: boolean): void {
    this.state.autoRunEnabled = enabled;
    this.updateStatusBarText();
    this.updateTooltip();
  }

  /**
   * Get auto-run enabled state
   */
  public isAutoRunEnabled(): boolean {
    return this.state.autoRunEnabled;
  }

  /**
   * Update status bar text based on current state
   */
  private updateStatusBarText(): void {
    // Only update if in ready state (other states have their own text)
    if (this.state.status !== 'ready') {
      return;
    }

    if (this.state.autoRunEnabled) {
      this.statusBarItem.text = '$(beaker) LiveCalc';
    } else {
      this.statusBarItem.text = '$(beaker) LiveCalc (Auto: OFF)';
    }
  }

  public setReady(): void {
    this.stopSpinner();
    this.state.status = 'ready';
    this.updateStatusBarText();
    this.statusBarItem.backgroundColor = undefined;
    this.updateTooltip();
  }

  public setRunning(): void {
    this.state.status = 'running';
    this.statusBarItem.text = '$(sync~spin) LiveCalc: Running...';
    this.statusBarItem.backgroundColor = undefined;
    this.updateTooltip();
  }

  public setProgress(percent: number): void {
    this.statusBarItem.text = `$(sync~spin) LiveCalc: ${Math.round(percent)}%`;
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      `**LiveCalc: Running**\n\nExecution ${Math.round(percent)}% complete\n\n_Click to open output channel_`
    );
  }

  public setCompleted(timeMs: number, policyCount?: number, scenarioCount?: number): void {
    this.stopSpinner();
    this.state.status = 'completed';
    this.state.lastRunTimeMs = timeMs;
    this.state.lastRunPolicies = policyCount;
    this.state.lastRunScenarios = scenarioCount;
    this.state.lastError = undefined;

    const timeStr = timeMs >= 1000 ? `${(timeMs / 1000).toFixed(1)}s` : `${Math.round(timeMs)}ms`;
    this.statusBarItem.text = `$(check) LiveCalc: ${timeStr}`;
    this.statusBarItem.backgroundColor = undefined;
    this.updateTooltip();
  }

  public setError(message: string): void {
    this.stopSpinner();
    this.state.status = 'error';
    this.state.lastError = message;
    this.statusBarItem.text = '$(error) LiveCalc: Error';
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.updateTooltip();
  }

  public show(): void {
    this.statusBarItem.show();
  }

  public hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * Build detailed tooltip based on current state
   */
  private updateTooltip(): void {
    const lines: string[] = [];

    // Status header
    switch (this.state.status) {
      case 'ready':
        lines.push('**LiveCalc: Ready**');
        break;
      case 'running':
        lines.push('**LiveCalc: Running**');
        lines.push('\nExecution in progress...');
        break;
      case 'completed':
        lines.push('**LiveCalc: Completed**');
        break;
      case 'error':
        lines.push('**LiveCalc: Error**');
        break;
    }

    // Last run info
    if (this.state.status === 'completed' && this.state.lastRunTimeMs !== undefined) {
      const timeStr = this.state.lastRunTimeMs >= 1000
        ? `${(this.state.lastRunTimeMs / 1000).toFixed(1)}s`
        : `${Math.round(this.state.lastRunTimeMs)}ms`;
      lines.push(`\nLast run: ${timeStr}`);

      if (this.state.lastRunPolicies !== undefined) {
        lines.push(`Policies: ${this.state.lastRunPolicies.toLocaleString()}`);
      }
      if (this.state.lastRunScenarios !== undefined) {
        lines.push(`Scenarios: ${this.state.lastRunScenarios.toLocaleString()}`);
      }
    }

    // Error info
    if (this.state.status === 'error' && this.state.lastError) {
      // Truncate long error messages
      const errorMsg = this.state.lastError.length > 100
        ? this.state.lastError.substring(0, 100) + '...'
        : this.state.lastError;
      lines.push(`\n_${errorMsg}_`);
    }

    // Engine state
    const engineState = this.state.engineInitialized ? 'Initialized' : 'Not initialized';
    lines.push(`\n---\nEngine: ${engineState}`);

    // Auto-run state
    const autoRunState = this.state.autoRunEnabled ? 'ON' : 'OFF';
    lines.push(`Auto-run: ${autoRunState}`);

    // Config path
    if (this.state.configPath) {
      const configName = this.state.configPath.split('/').pop() || 'livecalc.config.json';
      lines.push(`Config: ${configName}`);
    }

    lines.push('\n_Click to open output channel_');

    this.statusBarItem.tooltip = new vscode.MarkdownString(lines.join('\n'));
  }

  /**
   * Get current state for testing/inspection
   */
  public getState(): Readonly<StatusBarState> {
    return { ...this.state };
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }
  }

  public dispose(): void {
    this.stopSpinner();
    this.statusBarItem.dispose();
  }
}
