import * as vscode from 'vscode';

/**
 * Status bar integration for LiveCalc
 * Shows extension state and last run time
 */
export class StatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private spinnerInterval?: NodeJS.Timeout;
  private spinnerFrames = ['$(sync~spin)', '$(sync~spin)', '$(sync~spin)', '$(sync~spin)'];
  private spinnerIndex = 0;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'livecalc.showOutput';
    this.setReady();
  }

  public setReady(): void {
    this.stopSpinner();
    this.statusBarItem.text = '$(beaker) LiveCalc';
    this.statusBarItem.tooltip = 'LiveCalc: Ready';
    this.statusBarItem.backgroundColor = undefined;
  }

  public setRunning(): void {
    this.statusBarItem.text = '$(sync~spin) LiveCalc: Running...';
    this.statusBarItem.tooltip = 'LiveCalc: Execution in progress';
    this.statusBarItem.backgroundColor = undefined;
  }

  public setProgress(percent: number): void {
    this.statusBarItem.text = `$(sync~spin) LiveCalc: ${Math.round(percent)}%`;
    this.statusBarItem.tooltip = `LiveCalc: Execution ${Math.round(percent)}% complete`;
  }

  public setCompleted(timeMs: number): void {
    this.stopSpinner();
    const timeStr = timeMs >= 1000 ? `${(timeMs / 1000).toFixed(1)}s` : `${Math.round(timeMs)}ms`;
    this.statusBarItem.text = `$(check) LiveCalc: ${timeStr}`;
    this.statusBarItem.tooltip = `LiveCalc: Last run completed in ${timeStr}`;
    this.statusBarItem.backgroundColor = undefined;
  }

  public setError(message: string): void {
    this.stopSpinner();
    this.statusBarItem.text = '$(error) LiveCalc: Error';
    this.statusBarItem.tooltip = `LiveCalc: ${message}`;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }

  public show(): void {
    this.statusBarItem.show();
  }

  public hide(): void {
    this.statusBarItem.hide();
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
