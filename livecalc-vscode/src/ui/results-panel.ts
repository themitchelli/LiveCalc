import * as vscode from 'vscode';
import * as path from 'path';
import { ResultsState, PanelState, ComparisonState, StatisticDelta } from './results-state';
import { ComparisonInfo } from './comparison';
import { RunHistoryEntry } from '../auto-run/run-history';
import { LiveCalcError, LiveCalcWarning, getErrorTitle } from './error-types';
import { logger } from '../logging/logger';
import { PipelineDataState } from '../pipeline/data-inspector';

/**
 * Display settings for the webview
 */
export interface DisplaySettings {
  currency: 'GBP' | 'USD' | 'EUR';
  decimalPlaces: number;
}

/**
 * Extended error state for webview
 */
export interface WebviewErrorState {
  type: string;
  title: string;
  message: string;
  guidance?: string;
  details?: string;
  filePath?: string;
  recoverable: boolean;
}

/**
 * Trigger info for auto-run change indicator
 */
export interface TriggerInfo {
  /** File names that triggered the run */
  files: string[];
  /** Change types for each file */
  types: ('modified' | 'created' | 'deleted')[];
  /** Whether this was an auto-triggered run (vs manual) */
  isAutoRun: boolean;
}

/**
 * Message types for communication between extension and webview
 */
export type WebviewMessage =
  | { type: 'setState'; state: PanelState }
  | { type: 'setLoading'; message?: string }
  | { type: 'setCancelled'; message?: string; newRunStarting?: boolean }
  | { type: 'setError'; error: string; details?: string }
  | { type: 'setErrorState'; errorState: WebviewErrorState }
  | { type: 'setResults'; results: ResultsState }
  | { type: 'setWarnings'; warnings: LiveCalcWarning[] }
  | { type: 'clearComparison' }
  | { type: 'pinComparison' }
  | { type: 'setSettings'; settings: DisplaySettings }
  | { type: 'setComparison'; comparison: ComparisonState | null; info: ComparisonInfo | null }
  | { type: 'setComparisonBaseline'; distribution: number[] | null }
  | { type: 'setTriggerInfo'; trigger: TriggerInfo | null }
  | { type: 'setHistory'; entries: RunHistoryEntry[] }
  | { type: 'setHistoryResults'; results: ResultsState | null; runId: string }
  | { type: 'setPipelineData'; pipelineData: PipelineDataState | null };

/**
 * Message types from webview to extension
 */
export type ExtensionMessage =
  | { type: 'retry' }
  | { type: 'viewLogs' }
  | { type: 'export'; format: 'csv' | 'json' | 'clipboard' }
  | { type: 'openFile'; path: string }
  | { type: 'openAMTable'; tableName: string; version?: string }
  | { type: 'clearComparison' }
  | { type: 'pinComparison' }
  | { type: 'toggleChartType' }
  | { type: 'toggleChartOverlay' }
  | { type: 'dismissTrigger' }
  | { type: 'ready' }
  | { type: 'viewHistoryRun'; runId: string }
  | { type: 'compareWithHistory'; runId: string }
  | { type: 'exportHistory' }
  | { type: 'clearHistory' }
  | { type: 'selectBusResource'; resourceName: string }
  | { type: 'exportBusResource'; resourceName: string }
  | { type: 'compareBusResources'; resourceA: string; resourceB: string }
  | { type: 'inspectOffset'; resourceName: string; offset: number };

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
   * Set panel to cancelled state
   * Shows "Cancelled" or "Cancelled - new run starting..." message
   */
  public setCancelled(message?: string, newRunStarting: boolean = false): void {
    const displayMessage = newRunStarting
      ? 'Cancelled - new run starting...'
      : message || 'Execution cancelled';
    this.currentState = { type: 'loading', message: displayMessage };
    this.postMessage({ type: 'setCancelled', message: displayMessage, newRunStarting });
  }

  /**
   * Set panel to error state (simple string error)
   */
  public setError(error: string, details?: string): void {
    this.currentState = { type: 'error', error, details };
    this.postMessage({ type: 'setError', error, details });
  }

  /**
   * Set panel to error state with structured error info
   */
  public setStructuredError(error: LiveCalcError): void {
    const title = getErrorTitle(error.type);
    this.currentState = { type: 'error', error: error.message, details: error.details };
    this.postMessage({
      type: 'setErrorState',
      errorState: {
        type: error.type,
        title,
        message: error.message,
        guidance: error.guidance,
        details: error.details,
        filePath: error.filePath,
        recoverable: error.recoverable,
      },
    });
  }

  /**
   * Set warnings for display (non-fatal issues)
   */
  public setWarnings(warnings: LiveCalcWarning[]): void {
    this.postMessage({ type: 'setWarnings', warnings });
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
   * Set comparison state with deltas and info
   */
  public setComparison(comparison: ComparisonState | null, info: ComparisonInfo | null): void {
    this.postMessage({ type: 'setComparison', comparison, info });
  }

  /**
   * Set comparison baseline distribution for chart overlay
   */
  public setComparisonBaseline(distribution: number[] | null): void {
    this.postMessage({ type: 'setComparisonBaseline', distribution });
  }

  /**
   * Set display settings
   */
  public setSettings(settings: DisplaySettings): void {
    this.postMessage({ type: 'setSettings', settings });
  }

  /**
   * Set trigger info for auto-run change indicator
   * Shows which files triggered the re-run
   */
  public setTriggerInfo(trigger: TriggerInfo | null): void {
    this.postMessage({ type: 'setTriggerInfo', trigger });
  }

  /**
   * Set run history entries for display
   */
  public setHistory(entries: RunHistoryEntry[]): void {
    this.postMessage({ type: 'setHistory', entries });
  }

  /**
   * Set pipeline data for intermediate data inspection
   */
  public setPipelineData(pipelineData: PipelineDataState | null): void {
    this.postMessage({ type: 'setPipelineData', pipelineData });
  }

  /**
   * Set full results for a historical run
   * Used when user clicks to view a specific historical run
   */
  public setHistoryResults(results: ResultsState | null, runId: string): void {
    this.postMessage({ type: 'setHistoryResults', results, runId });
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
          case 'openFile':
            // Open a file in the editor
            if (message.path) {
              const fileUri = vscode.Uri.file(message.path);
              vscode.window.showTextDocument(fileUri, { preview: true });
            }
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
      <span class="error-type-badge" id="error-type-badge"></span>
      <h2 id="error-title">Error</h2>
      <p id="error-message"></p>
      <div id="error-guidance-container" class="error-guidance hidden">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4"/>
          <path d="M12 8h.01"/>
        </svg>
        <span id="error-guidance"></span>
      </div>
      <div id="error-file-container" class="error-file hidden">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span id="error-file" class="error-file-link"></span>
      </div>
      <details id="error-details-container" class="hidden">
        <summary>Stack Trace</summary>
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
      <!-- Trigger Info Banner (shows what files triggered auto-run) -->
      <div id="trigger-banner" class="trigger-banner hidden">
        <div class="trigger-content">
          <svg class="trigger-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4"/>
            <path d="M12 18v4"/>
            <path d="M4.93 4.93l2.83 2.83"/>
            <path d="M16.24 16.24l2.83 2.83"/>
            <path d="M2 12h4"/>
            <path d="M18 12h4"/>
            <path d="M4.93 19.07l2.83-2.83"/>
            <path d="M16.24 7.76l2.83-2.83"/>
          </svg>
          <span class="trigger-text">Triggered by: <span id="trigger-files" class="trigger-files"></span></span>
        </div>
        <button id="dismiss-trigger-btn" class="btn-dismiss" title="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Warnings Banner -->
      <div id="warnings-banner" class="warnings-banner hidden">
        <div class="warnings-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span id="warnings-count">Warnings</span>
          <button id="dismiss-warnings-btn" class="btn-dismiss" title="Dismiss warnings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <ul id="warnings-list" class="warnings-list">
          <!-- Populated dynamically -->
        </ul>
      </div>

      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-left">
          <span class="results-title">Valuation Results</span>
          <span id="comparison-badge" class="comparison-badge hidden" title="Comparing to baseline">
            vs baseline
          </span>
        </div>
        <div class="toolbar-right">
          <button id="pin-comparison-btn" class="btn btn-small btn-secondary hidden" title="Pin current results as comparison baseline">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L12 12"/>
              <path d="M17 7L12 12L7 7"/>
              <rect x="4" y="14" width="16" height="8" rx="1"/>
            </svg>
            Pin Baseline
          </button>
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

        <!-- Run Info Row -->
        <div class="run-info-grid">
          <div class="run-info-item">
            <span class="run-info-label">Policies</span>
            <span class="run-info-value" id="stat-policies">-</span>
          </div>
          <div class="run-info-item">
            <span class="run-info-label">Scenarios</span>
            <span class="run-info-value" id="stat-scenarios">-</span>
          </div>
          <div class="run-info-item">
            <span class="run-info-label">Execution Time</span>
            <span class="run-info-value" id="stat-exectime">-</span>
          </div>
        </div>
      </section>

      <!-- Distribution Chart -->
      <section class="chart-section">
        <div class="chart-header">
          <h3>Distribution</h3>
          <div class="chart-controls">
            <button id="toggle-chart-overlay" class="btn btn-small hidden" title="Toggle baseline overlay">
              Show Overlay
            </button>
            <button id="toggle-chart-type" class="btn btn-small" title="Toggle histogram/density">
              Histogram
            </button>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="distribution-chart"></canvas>
        </div>
      </section>

      <!-- Pipeline Data Tab (shown when pipeline is used) -->
      <section id="pipeline-data-section" class="pipeline-data-section hidden">
        <div class="pipeline-data-header">
          <h3>Pipeline Data</h3>
          <div class="pipeline-data-controls">
            <select id="bus-resource-select" class="bus-resource-select" title="Select bus resource">
              <option value="">Select a bus resource...</option>
              <!-- Populated dynamically -->
            </select>
            <button id="export-bus-resource-btn" class="btn btn-small" title="Export resource to CSV" disabled>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export CSV
            </button>
            <select id="comparison-resource-select" class="comparison-resource-select hidden" title="Compare with...">
              <option value="">Compare with...</option>
              <!-- Populated dynamically -->
            </select>
          </div>
        </div>

        <!-- Empty state when no resource selected -->
        <div id="bus-data-empty" class="bus-data-empty">
          <p>Select a bus resource to inspect intermediate data.</p>
        </div>

        <!-- Statistics Grid for selected resource -->
        <div id="bus-data-stats" class="bus-data-stats hidden">
          <h4 id="selected-resource-name">bus://...</h4>
          <div class="bus-stats-grid">
            <div class="stat-card">
              <div class="stat-label">Mean</div>
              <div class="stat-value" id="bus-stat-mean">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Std Dev</div>
              <div class="stat-value" id="bus-stat-stddev">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Min / Max</div>
              <div class="stat-value" id="bus-stat-minmax">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">P50 (Median)</div>
              <div class="stat-value" id="bus-stat-p50">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">P90</div>
              <div class="stat-value" id="bus-stat-p90">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">P95</div>
              <div class="stat-value" id="bus-stat-p95">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Count</div>
              <div class="stat-value" id="bus-stat-count">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Checksum</div>
              <div class="stat-value" id="bus-stat-checksum">-</div>
            </div>
          </div>

          <!-- Histogram for intermediate data -->
          <div class="bus-chart-container">
            <canvas id="bus-histogram-chart"></canvas>
          </div>

          <!-- Time-travel controls -->
          <div class="time-travel-controls">
            <label>
              Time-travel:
              <select id="snapshot-selector" title="Select snapshot">
                <option value="latest">Latest</option>
                <!-- Populated dynamically with timestamps -->
              </select>
            </label>
            <label>
              Inspect offset:
              <input type="number" id="offset-input" min="0" placeholder="0" title="Scenario/policy offset">
              <button id="inspect-offset-btn" class="btn btn-small">Inspect</button>
            </label>
            <span id="offset-value" class="offset-value hidden">Value: <strong id="offset-value-display">-</strong></span>
          </div>

          <!-- Data Table View with Pagination -->
          <details id="bus-data-table-section">
            <summary>
              <span class="section-title">Data Table</span>
              <span class="expand-icon"></span>
            </summary>
            <div class="section-content">
              <div class="pagination-controls">
                <button id="prev-page-btn" class="btn btn-small" disabled>Previous</button>
                <span id="page-info">Page 1 of 1</span>
                <button id="next-page-btn" class="btn btn-small" disabled>Next</button>
                <select id="page-size-select" title="Rows per page">
                  <option value="50">50 rows</option>
                  <option value="100" selected>100 rows</option>
                  <option value="500">500 rows</option>
                  <option value="1000">1000 rows</option>
                </select>
              </div>
              <table id="bus-data-table" class="bus-data-table">
                <thead>
                  <tr>
                    <th>Index</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody id="bus-data-table-body">
                  <!-- Populated dynamically -->
                </tbody>
              </table>
            </div>
          </details>

          <!-- Comparison View -->
          <div id="comparison-view" class="comparison-view hidden">
            <h4>Comparison: <span id="comparison-summary">-</span></h4>
            <div class="comparison-stats">
              <div class="stat-card">
                <div class="stat-label">Total Differences</div>
                <div class="stat-value" id="comp-total-diffs">-</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Max Abs Diff</div>
                <div class="stat-value" id="comp-max-diff">-</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Mean Abs Diff</div>
                <div class="stat-value" id="comp-mean-diff">-</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Diff %</div>
                <div class="stat-value" id="comp-diff-pct">-</div>
              </div>
            </div>
            <details id="comparison-details-section">
              <summary>
                <span class="section-title">Difference Details (first 100)</span>
                <span class="expand-icon"></span>
              </summary>
              <div class="section-content">
                <table class="comparison-table">
                  <thead>
                    <tr>
                      <th>Index</th>
                      <th>Value A</th>
                      <th>Value B</th>
                      <th>Diff</th>
                    </tr>
                  </thead>
                  <tbody id="comparison-table-body">
                    <!-- Populated dynamically -->
                  </tbody>
                </table>
              </div>
            </details>
          </div>
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
            <!-- Interest Rate Parameters (shown when applicable) -->
            <div id="interest-rate-section" class="metadata-subsection hidden">
              <h4>Interest Rate Parameters</h4>
              <dl class="metadata-list">
                <dt>Initial Rate</dt>
                <dd id="meta-ir-initial">-</dd>
                <dt>Drift</dt>
                <dd id="meta-ir-drift">-</dd>
                <dt>Volatility</dt>
                <dd id="meta-ir-volatility">-</dd>
                <dt>Min Rate</dt>
                <dd id="meta-ir-min">-</dd>
                <dt>Max Rate</dt>
                <dd id="meta-ir-max">-</dd>
              </dl>
            </div>
            <!-- Cloud Execution Info (shown when execution mode is cloud) -->
            <div id="cloud-execution-section" class="metadata-subsection hidden">
              <h4>Cloud Execution</h4>
              <dl class="metadata-list">
                <dt>Job ID</dt>
                <dd id="meta-job-id">-</dd>
                <dt>Cost</dt>
                <dd id="meta-cost">-</dd>
              </dl>
            </div>
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

        <details id="history-section">
          <summary>
            <span class="section-title">Run History</span>
            <span class="history-count" id="history-count"></span>
            <span class="expand-icon"></span>
          </summary>
          <div class="section-content">
            <div class="history-toolbar">
              <button id="export-history-btn" class="btn btn-small" title="Export history to CSV">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export CSV
              </button>
              <button id="clear-history-btn" class="btn btn-small btn-secondary" title="Clear history">
                Clear
              </button>
            </div>
            <div id="history-empty" class="history-empty hidden">
              <p>No run history yet.</p>
            </div>
            <table id="history-table" class="history-table hidden">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Trigger</th>
                  <th>Duration</th>
                  <th>Mean NPV</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="history-body">
                <!-- Populated dynamically -->
              </tbody>
            </table>
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
