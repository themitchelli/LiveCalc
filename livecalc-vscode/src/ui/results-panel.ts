import * as vscode from 'vscode';
import * as path from 'path';
import { ResultsState, PanelState } from './results-state';
import { logger } from '../logging/logger';

/**
 * Message types for communication between extension and webview
 */
export type WebviewMessage =
  | { type: 'setState'; state: PanelState }
  | { type: 'setLoading'; message?: string }
  | { type: 'setError'; error: string; details?: string }
  | { type: 'setResults'; results: ResultsState }
  | { type: 'clearComparison' }
  | { type: 'pinComparison' };

/**
 * Message types from webview to extension
 */
export type ExtensionMessage =
  | { type: 'retry' }
  | { type: 'viewLogs' }
  | { type: 'export'; format: 'csv' | 'json' | 'clipboard' }
  | { type: 'openFile'; path: string }
  | { type: 'clearComparison' }
  | { type: 'pinComparison' }
  | { type: 'toggleChartType' }
  | { type: 'ready' };

/**
 * Results Panel provider for displaying valuation results in a webview
 */
export class ResultsPanel implements vscode.Disposable {
  public static readonly viewType = 'livecalc.results';

  private static instance: ResultsPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private currentState: PanelState = { type: 'empty' };
  private onMessageHandler?: (message: ExtensionMessage) => void;

  /**
   * Get or create the singleton Results Panel instance
   */
  public static getInstance(extensionUri: vscode.Uri): ResultsPanel {
    if (!ResultsPanel.instance) {
      ResultsPanel.instance = new ResultsPanel(extensionUri);
    }
    return ResultsPanel.instance;
  }

  /**
   * Get existing instance (without creating)
   */
  public static getExistingInstance(): ResultsPanel | undefined {
    return ResultsPanel.instance;
  }

  private constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  /**
   * Show the results panel (creates if not exists)
   */
  public show(): void {
    if (this.panel) {
      // Reveal existing panel
      this.panel.reveal(vscode.ViewColumn.Two);
    } else {
      // Create new panel
      this.createPanel();
    }
  }

  /**
   * Set message handler for webview messages
   */
  public onMessage(handler: (message: ExtensionMessage) => void): void {
    this.onMessageHandler = handler;
  }

  /**
   * Set panel to loading state
   */
  public setLoading(message?: string): void {
    this.currentState = { type: 'loading', message };
    this.postMessage({ type: 'setLoading', message });
  }

  /**
   * Set panel to error state
   */
  public setError(error: string, details?: string): void {
    this.currentState = { type: 'error', error, details };
    this.postMessage({ type: 'setError', error, details });
  }

  /**
   * Set panel to results state
   */
  public setResults(results: ResultsState): void {
    this.currentState = { type: 'results', results };
    this.postMessage({ type: 'setResults', results });
  }

  /**
   * Clear comparison baseline
   */
  public clearComparison(): void {
    this.postMessage({ type: 'clearComparison' });
  }

  /**
   * Get current panel state
   */
  public getState(): PanelState {
    return this.currentState;
  }

  /**
   * Check if panel is visible
   */
  public isVisible(): boolean {
    return this.panel?.visible ?? false;
  }

  /**
   * Create the webview panel
   */
  private createPanel(): void {
    this.panel = vscode.window.createWebviewPanel(
      ResultsPanel.viewType,
      'LiveCalc Results',
      {
        viewColumn: vscode.ViewColumn.Two,
        preserveFocus: true,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
          vscode.Uri.joinPath(this.extensionUri, 'dist'),
        ],
      }
    );

    // Set icon
    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png');

    // Set HTML content
    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message: ExtensionMessage) => {
        logger.debug(`Received message from webview: ${message.type}`);

        switch (message.type) {
          case 'ready':
            // Webview is ready, send current state
            this.postMessage({ type: 'setState', state: this.currentState });
            break;
          case 'viewLogs':
            vscode.commands.executeCommand('livecalc.showOutput');
            break;
          case 'retry':
            vscode.commands.executeCommand('livecalc.run');
            break;
          default:
            // Forward to external handler
            if (this.onMessageHandler) {
              this.onMessageHandler(message);
            }
        }
      },
      undefined,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        logger.debug('Results panel disposed');
      },
      undefined,
      this.disposables
    );

    // Handle visibility changes
    this.panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) {
          logger.debug('Results panel became visible');
          // Re-send current state when panel becomes visible
          this.postMessage({ type: 'setState', state: this.currentState });
        }
      },
      undefined,
      this.disposables
    );

    logger.info('Results panel created');
  }

  /**
   * Post message to webview
   */
  private postMessage(message: WebviewMessage): void {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  /**
   * Get webview URI for a local resource
   */
  private getWebviewUri(relativePath: string): vscode.Uri {
    if (!this.panel) {
      throw new Error('Panel not initialized');
    }
    return this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, relativePath)
    );
  }

  /**
   * Generate HTML content for the webview
   */
  private getHtmlContent(): string {
    const webview = this.panel!.webview;
    const nonce = getNonce();

    // Get URIs for resources
    const stylesUri = this.getWebviewUri('media/results/styles.css');
    const scriptUri = this.getWebviewUri('media/results/main.js');
    const chartJsUri = this.getWebviewUri('media/vendor/chart.min.js');
    const annotationPluginUri = this.getWebviewUri('media/vendor/chartjs-plugin-annotation.min.js');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <link href="${stylesUri}" rel="stylesheet">
  <title>LiveCalc Results</title>
</head>
<body>
  <div id="app">
    <!-- Loading State -->
    <div id="loading-state" class="state-container hidden">
      <div class="loading-spinner"></div>
      <p id="loading-message">Loading...</p>
    </div>

    <!-- Error State -->
    <div id="error-state" class="state-container hidden">
      <div class="error-icon">!</div>
      <h2 id="error-title">Error</h2>
      <p id="error-message"></p>
      <details id="error-details-container" class="hidden">
        <summary>Details</summary>
        <pre id="error-details"></pre>
      </details>
      <div class="error-actions">
        <button id="retry-btn" class="btn btn-primary">Retry</button>
        <button id="view-logs-btn" class="btn btn-secondary">View Logs</button>
      </div>
    </div>

    <!-- Empty State -->
    <div id="empty-state" class="state-container">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 3v18h18"/>
          <path d="M18 17V9"/>
          <path d="M13 17V5"/>
          <path d="M8 17v-3"/>
        </svg>
      </div>
      <h2>No Results Yet</h2>
      <p>Run a valuation to see results here.</p>
      <p class="shortcut-hint">Press <kbd>Cmd+Shift+R</kbd> or <kbd>Ctrl+Shift+R</kbd> to run.</p>
    </div>

    <!-- Results State -->
    <div id="results-state" class="state-container hidden">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-left">
          <span class="results-title">Valuation Results</span>
        </div>
        <div class="toolbar-right">
          <div class="export-dropdown">
            <button id="export-btn" class="btn btn-icon" title="Export results">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <div id="export-menu" class="dropdown-menu hidden">
              <button data-format="csv">Export CSV</button>
              <button data-format="json">Export JSON</button>
              <button data-format="clipboard">Copy to Clipboard</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Statistics Grid -->
      <section class="statistics-section">
        <div class="stats-grid">
          <div class="stat-card stat-primary">
            <div class="stat-label">Mean NPV</div>
            <div class="stat-value" id="stat-mean">-</div>
            <div class="stat-delta hidden" id="delta-mean"></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Standard Deviation</div>
            <div class="stat-value" id="stat-stddev">-</div>
            <div class="stat-delta hidden" id="delta-stddev"></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">CTE 95</div>
            <div class="stat-value" id="stat-cte95">-</div>
            <div class="stat-delta hidden" id="delta-cte95"></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">P50 (Median)</div>
            <div class="stat-value" id="stat-p50">-</div>
            <div class="stat-delta hidden" id="delta-p50"></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">P75</div>
            <div class="stat-value" id="stat-p75">-</div>
            <div class="stat-delta hidden" id="delta-p75"></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">P90</div>
            <div class="stat-value" id="stat-p90">-</div>
            <div class="stat-delta hidden" id="delta-p90"></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">P95</div>
            <div class="stat-value" id="stat-p95">-</div>
            <div class="stat-delta hidden" id="delta-p95"></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">P99</div>
            <div class="stat-value" id="stat-p99">-</div>
            <div class="stat-delta hidden" id="delta-p99"></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Min / Max</div>
            <div class="stat-value" id="stat-minmax">-</div>
          </div>
        </div>
      </section>

      <!-- Distribution Chart -->
      <section class="chart-section">
        <div class="chart-header">
          <h3>Distribution</h3>
          <div class="chart-controls">
            <button id="toggle-chart-type" class="btn btn-small" title="Toggle histogram/density">
              Histogram
            </button>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="distribution-chart"></canvas>
        </div>
      </section>

      <!-- Collapsible Sections -->
      <section class="collapsible-section">
        <details id="run-metadata">
          <summary>
            <span class="section-title">Run Metadata</span>
            <span class="expand-icon"></span>
          </summary>
          <div class="section-content">
            <dl class="metadata-list">
              <dt>Run ID</dt>
              <dd id="meta-runid">-</dd>
              <dt>Timestamp</dt>
              <dd id="meta-timestamp">-</dd>
              <dt>Model File</dt>
              <dd id="meta-model">-</dd>
              <dt>Policy File</dt>
              <dd id="meta-policies">-</dd>
              <dt>Policies</dt>
              <dd id="meta-policy-count">-</dd>
              <dt>Scenarios</dt>
              <dd id="meta-scenario-count">-</dd>
              <dt>Seed</dt>
              <dd id="meta-seed">-</dd>
              <dt>Execution Mode</dt>
              <dd id="meta-mode">Local</dd>
            </dl>
          </div>
        </details>

        <details id="assumptions-section">
          <summary>
            <span class="section-title">Assumptions Used</span>
            <span class="expand-icon"></span>
          </summary>
          <div class="section-content">
            <ul class="assumptions-list" id="assumptions-list">
              <!-- Populated dynamically -->
            </ul>
          </div>
        </details>
      </section>

      <!-- Footer -->
      <footer class="results-footer">
        <span id="footer-summary">-</span>
        <div class="comparison-actions hidden" id="comparison-actions">
          <button id="clear-comparison-btn" class="btn btn-small">Clear Comparison</button>
        </div>
      </footer>
    </div>
  </div>

  <script nonce="${nonce}" src="${chartJsUri}"></script>
  <script nonce="${nonce}" src="${annotationPluginUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Dispose the panel and resources
   */
  public dispose(): void {
    ResultsPanel.instance = undefined;

    if (this.panel) {
      this.panel.dispose();
    }

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

/**
 * Generate a nonce for Content Security Policy
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
