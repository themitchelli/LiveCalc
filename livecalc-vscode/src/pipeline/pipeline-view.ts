import * as vscode from 'vscode';
import * as path from 'path';
import { PipelineConfig, PipelineNode } from '../types';
import { logger } from '../logging/logger';
import { IntegrityFailure, IntegritySummary } from './culprit-identifier';

/**
 * Node execution status for visualization
 */
export type NodeStatus = 'pending' | 'running' | 'complete' | 'error';

/**
 * Node state for visualization including timing and checksums
 */
export interface PipelineNodeState {
  id: string;
  name: string;
  engineType: 'wasm' | 'python';
  status: NodeStatus;
  inputs: string[];
  outputs: string[];
  error?: string;
  timing?: {
    initMs?: number;
    executeMs?: number;
    handoffMs?: number;
    totalMs?: number;
  };
  checksums?: Record<string, number>;
  /** Whether this node is identified as a culprit for integrity failures */
  isCulprit?: boolean;
  /** Integrity failures caused by this node */
  integrityFailures?: IntegrityFailure[];
}

/**
 * Connection between nodes in the pipeline DAG
 */
export interface PipelineConnection {
  from: string;
  to: string;
  busResource: string;
  dataSize?: number;
}

/**
 * Pipeline execution state for visualization
 */
export interface PipelineExecutionState {
  nodes: PipelineNodeState[];
  connections: PipelineConnection[];
  currentNode?: string;
  startTime?: number;
  endTime?: number;
  /** Integrity summary for all bus resources */
  integritySummary?: IntegritySummary;
}

/**
 * Message types from webview to extension
 */
export type PipelineViewMessage =
  | { type: 'nodeClicked'; nodeId: string }
  | { type: 'ready' }
  | { type: 'exportSvg' }
  | { type: 'refresh' }
  | { type: 'exportIntegrityReport' };

/**
 * Message types from extension to webview
 */
export type PipelineWebviewMessage =
  | { type: 'setState'; state: PipelineExecutionState }
  | { type: 'updateNodeStatus'; nodeId: string; status: NodeStatus; timing?: PipelineNodeState['timing']; checksums?: Record<string, number>; error?: string }
  | { type: 'setCurrentNode'; nodeId: string | null }
  | { type: 'setIntegritySummary'; summary: IntegritySummary }
  | { type: 'highlightCulprit'; nodeId: string; failures: IntegrityFailure[] }
  | { type: 'clear' };

/**
 * Pipeline View provider for visualizing pipeline execution as DAG
 */
export class PipelineView implements vscode.Disposable {
  public static readonly viewType = 'livecalc.pipelineView';

  private static instance: PipelineView | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private currentState: PipelineExecutionState | undefined;
  private onMessageHandler?: (message: PipelineViewMessage) => void;

  /**
   * Get or create the singleton Pipeline View instance
   */
  public static getInstance(extensionUri: vscode.Uri): PipelineView {
    if (!PipelineView.instance) {
      PipelineView.instance = new PipelineView(extensionUri);
    }
    return PipelineView.instance;
  }

  private constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  /**
   * Show the pipeline view panel
   */
  public show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two, true);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      PipelineView.viewType,
      'LiveCalc Pipeline',
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png');
    this.panel.webview.html = this.getHtmlContent(this.panel.webview);

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message: PipelineViewMessage) => {
        if (this.onMessageHandler) {
          this.onMessageHandler(message);
        }
      },
      undefined,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      null,
      this.disposables
    );

    logger.debug('Pipeline view panel created');

    // If we have current state, restore it
    if (this.currentState) {
      this.postMessage({ type: 'setState', state: this.currentState });
    }
  }

  /**
   * Set message handler for webview messages
   */
  public onMessage(handler: (message: PipelineViewMessage) => void): void {
    this.onMessageHandler = handler;
  }

  /**
   * Initialize pipeline view with config
   */
  public initialize(config: PipelineConfig): void {
    const state = this.createInitialState(config);
    this.currentState = state;
    this.show();
    this.postMessage({ type: 'setState', state });
    logger.debug(`Pipeline view initialized with ${state.nodes.length} nodes`);
  }

  /**
   * Update node status during execution
   */
  public updateNodeStatus(
    nodeId: string,
    status: NodeStatus,
    timing?: PipelineNodeState['timing'],
    checksums?: Record<string, number>,
    error?: string
  ): void {
    if (this.currentState) {
      const node = this.currentState.nodes.find((n) => n.id === nodeId);
      if (node) {
        node.status = status;
        if (timing) {
          node.timing = { ...node.timing, ...timing };
        }
        if (checksums) {
          node.checksums = { ...node.checksums, ...checksums };
        }
        if (error) {
          node.error = error;
        }
      }
    }
    this.postMessage({ type: 'updateNodeStatus', nodeId, status, timing, checksums, error });
  }

  /**
   * Set the currently executing node
   */
  public setCurrentNode(nodeId: string | null): void {
    if (this.currentState) {
      this.currentState.currentNode = nodeId || undefined;
    }
    this.postMessage({ type: 'setCurrentNode', nodeId });
  }

  /**
   * Mark pipeline execution as started
   */
  public markStart(): void {
    if (this.currentState) {
      this.currentState.startTime = Date.now();
    }
  }

  /**
   * Mark pipeline execution as complete
   */
  public markComplete(): void {
    if (this.currentState) {
      this.currentState.endTime = Date.now();
    }
  }

  /**
   * Set integrity summary for pipeline execution
   *
   * @param summary - Integrity summary from CulpritIdentifier
   */
  public setIntegritySummary(summary: IntegritySummary): void {
    if (this.currentState) {
      this.currentState.integritySummary = summary;

      // Update node states to mark culprits
      for (const node of this.currentState.nodes) {
        const isCulprit = summary.culpritNodeIds.includes(node.id);
        if (isCulprit) {
          node.isCulprit = true;
          node.integrityFailures = summary.failures.filter((f) => f.culpritNodeId === node.id);
          // Highlight culprit visually
          this.postMessage({
            type: 'highlightCulprit',
            nodeId: node.id,
            failures: node.integrityFailures,
          });
        }
      }

      // Send summary to webview
      this.postMessage({ type: 'setIntegritySummary', summary });
    }
  }

  /**
   * Clear pipeline view
   */
  public clear(): void {
    this.currentState = undefined;
    this.postMessage({ type: 'clear' });
  }

  /**
   * Create initial pipeline state from config
   */
  private createInitialState(config: PipelineConfig): PipelineExecutionState {
    const nodes: PipelineNodeState[] = config.nodes.map((node) => ({
      id: node.id,
      name: node.id,
      engineType: node.engine.startsWith('wasm://') ? 'wasm' : 'python',
      status: 'pending',
      inputs: node.inputs || [],
      outputs: node.outputs || [],
    }));

    const connections: PipelineConnection[] = [];
    for (const node of config.nodes) {
      for (const input of node.inputs || []) {
        if (input.startsWith('bus://')) {
          // Find the upstream node that produces this output
          for (const upstreamNode of config.nodes) {
            if (upstreamNode.outputs.includes(input)) {
              connections.push({
                from: upstreamNode.id,
                to: node.id,
                busResource: input,
              });
            }
          }
        }
      }
    }

    return { nodes, connections };
  }

  /**
   * Post message to webview
   */
  private postMessage(message: PipelineWebviewMessage): void {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  /**
   * Get HTML content for the webview
   */
  private getHtmlContent(webview: vscode.Webview): string {
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'pipeline', 'styles.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'pipeline', 'main.js')
    );

    // Nonce for CSP
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${stylesUri}" rel="stylesheet">
  <title>LiveCalc Pipeline</title>
</head>
<body>
  <div id="toolbar">
    <button id="refreshBtn" title="Refresh Pipeline">
      <span class="codicon codicon-refresh"></span>
    </button>
    <button id="exportBtn" title="Export as SVG">
      <span class="codicon codicon-export"></span>
    </button>
    <div id="statusText"></div>
  </div>

  <div id="container">
    <div id="emptyState">
      <div class="empty-icon">$(graph)</div>
      <h2>No Pipeline Configuration</h2>
      <p>This project doesn't use a pipeline configuration.</p>
      <p>Add a <code>pipeline</code> block to <code>livecalc.config.json</code> to visualize execution.</p>
    </div>

    <svg id="pipelineSvg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="var(--vscode-foreground)" opacity="0.5" />
        </marker>
        <marker id="arrowhead-active" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="var(--vscode-charts-blue)" />
        </marker>
      </defs>
      <g id="connections"></g>
      <g id="nodes"></g>
    </svg>

    <div id="nodeDetails" class="hidden">
      <div class="details-header">
        <h3 id="detailsTitle">Node Details</h3>
        <button id="closeDetailsBtn" title="Close">
          <span class="codicon codicon-close"></span>
        </button>
      </div>
      <div class="details-content">
        <div class="details-section">
          <h4>Status</h4>
          <div id="detailsStatus"></div>
        </div>
        <div class="details-section">
          <h4>Engine</h4>
          <div id="detailsEngine"></div>
        </div>
        <div class="details-section">
          <h4>Inputs</h4>
          <ul id="detailsInputs"></ul>
        </div>
        <div class="details-section">
          <h4>Outputs</h4>
          <ul id="detailsOutputs"></ul>
        </div>
        <div class="details-section" id="timingSection">
          <h4>Timing</h4>
          <table id="detailsTiming">
            <tr><td>Init:</td><td id="timingInit">-</td></tr>
            <tr><td>Execute:</td><td id="timingExecute">-</td></tr>
            <tr><td>Handoff:</td><td id="timingHandoff">-</td></tr>
            <tr><td>Total:</td><td id="timingTotal">-</td></tr>
          </table>
        </div>
        <div class="details-section" id="checksumSection">
          <h4>Checksums</h4>
          <ul id="detailsChecksums"></ul>
        </div>
        <div class="details-section" id="errorSection">
          <h4>Error</h4>
          <div id="detailsError"></div>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for CSP
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    PipelineView.instance = undefined;
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
