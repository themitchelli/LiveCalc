/**
 * Result Streamer for Cloud Execution
 *
 * Consumes WebSocket stream from cloud worker and updates Results Panel in real-time.
 */

import * as vscode from 'vscode';
import { logger } from '../logging/logger';
import { ResultsState, createResultsState } from '../ui/results-state';
import { AssumptionInfo } from '../ui/results-state';

// Use browser WebSocket API (available in VS Code extension runtime)
type WebSocket = any;

export interface StreamMessage {
  type: 'connected' | 'initialized' | 'progress' | 'complete' | 'error';
  jobId?: string;
  pipelineId?: string;
  assetsHash?: string;
  nodeCount?: number;
  current?: number;
  total?: number;
  message?: string;
  executionTimeMs?: number;
  error?: string;
  details?: string | string[];
}

export interface CloudResults {
  statistics: {
    mean: number;
    stdDev: number;
    cte95: number;
    percentiles: {
      p50: number;
      p75: number;
      p90: number;
      p95: number;
      p99: number;
    };
    min: number;
    max: number;
  };
  executionTimeMs: number;
  policyCount: number;
  scenarioCount: number;
}

export type ProgressCallback = (current: number, total: number, message: string) => void;
export type ResultsCallback = (results: ResultsState) => void;
export type ErrorCallback = (error: string, details?: string) => void;

/**
 * Streams results from cloud worker via WebSocket
 */
export class ResultStreamer {
  private ws: WebSocket | null = null;
  private jobId: string | null = null;

  constructor(
    private websocketUrl: string,
    private onProgress: ProgressCallback,
    private onResults: ResultsCallback,
    private onError: ErrorCallback
  ) {}

  /**
   * Connect to WebSocket and initiate execution
   */
  async connect(
    jobId: string,
    payload: {
      config: any;
      wasmBinaries?: Record<string, string>;
      pythonScripts?: Record<string, string>;
      assumptionRefs?: string[];
    }
  ): Promise<void> {
    this.jobId = jobId;

    return new Promise((resolve, reject) => {
      logger.info(`Connecting to WebSocket: ${this.websocketUrl}`);

      // Use browser WebSocket API
      this.ws = new (global as any).WebSocket(this.websocketUrl);

      this.ws.addEventListener('open', () => {
        logger.info('WebSocket connected');

        // Send execution command
        this.ws!.send(JSON.stringify({
          type: 'execute',
          jobId,
          payload
        }));

        resolve();
      });

      this.ws.addEventListener('message', (event: MessageEvent) => {
        this.handleMessage(event.data);
      });

      this.ws.addEventListener('error', (error: any) => {
        logger.error('WebSocket error');
        reject(new Error('WebSocket connection failed'));
      });

      this.ws.addEventListener('close', () => {
        logger.info('WebSocket closed');
      });
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string | ArrayBuffer | Blob): void {
    try {
      // Handle string messages (JSON control messages)
      if (typeof data === 'string') {
        const message: StreamMessage = JSON.parse(data);
        this.handleControlMessage(message);
      }
      // Handle binary data (results)
      else if (data instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(data);
        if (text.startsWith('{')) {
          const message: StreamMessage = JSON.parse(text);
          this.handleControlMessage(message);
        } else {
          this.handleResultsData(new Uint8Array(data));
        }
      }
      // Handle Blob (convert to ArrayBuffer first)
      else if (data instanceof Blob) {
        data.arrayBuffer().then(buffer => {
          this.handleMessage(buffer);
        });
      }
    } catch (error) {
      logger.error('Failed to handle WebSocket message', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Handle control messages (JSON)
   */
  private handleControlMessage(message: StreamMessage): void {
    logger.debug(`WebSocket message: ${message.type}`);

    switch (message.type) {
      case 'connected':
        logger.info('Cloud worker connection confirmed');
        break;

      case 'initialized':
        logger.info(`Pipeline initialized: ${message.pipelineId}, nodes: ${message.nodeCount}`);
        this.onProgress(0, message.nodeCount || 1, 'Pipeline initialized');
        break;

      case 'progress':
        if (message.current && message.total) {
          this.onProgress(message.current, message.total, message.message || `Processing ${message.current}/${message.total}`);
        }
        break;

      case 'complete':
        logger.info(`Execution complete in ${message.executionTimeMs}ms`);
        // Results will arrive as binary data separately
        break;

      case 'error':
        const errorMessage = message.error || 'Unknown error';
        const details = Array.isArray(message.details)
          ? message.details.join('\n')
          : message.details;
        logger.error(`Execution error: ${errorMessage}`);
        this.onError(errorMessage, details);
        this.disconnect();
        break;
    }
  }

  /**
   * Handle binary results data
   */
  private handleResultsData(data: Uint8Array): void {
    try {
      // Parse binary results
      const text = new TextDecoder().decode(data);
      const cloudResults: CloudResults = JSON.parse(text);
      logger.info('Received cloud results');

      // Convert to ResultsState format
      const resultsState = this.convertToResultsState(cloudResults);

      // Send to results panel
      this.onResults(resultsState);

      // Close connection after results received
      this.disconnect();
    } catch (error) {
      logger.error('Failed to parse results data', error instanceof Error ? error : undefined);
      this.onError('Failed to parse results', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Convert cloud results to ResultsState
   */
  private convertToResultsState(cloudResults: CloudResults): ResultsState {
    // Generate mock distribution (in future, this will come from cloud)
    const distribution: number[] = [];
    const { mean, stdDev } = cloudResults.statistics;
    for (let i = 0; i < cloudResults.scenarioCount; i++) {
      // Simple normal distribution approximation
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      distribution.push(mean + z * stdDev);
    }

    // Create mock config for demonstration
    const mockConfig: any = {
      modelFile: 'model.mga',
      scenarios: {
        count: cloudResults.scenarioCount,
        seed: 42,
        interestRate: {
          initial: 0.05,
          drift: 0.02,
          volatility: 0.15,
          min: 0.01,
          max: 0.10
        }
      }
    };

    return createResultsState(
      {
        mean: cloudResults.statistics.mean,
        stdDev: cloudResults.statistics.stdDev,
        cte95: cloudResults.statistics.cte95,
        min: cloudResults.statistics.min,
        max: cloudResults.statistics.max,
        percentiles: {
          p50: cloudResults.statistics.percentiles.p50,
          p75: cloudResults.statistics.percentiles.p75,
          p90: cloudResults.statistics.percentiles.p90,
          p95: cloudResults.statistics.percentiles.p95,
          p99: cloudResults.statistics.percentiles.p99
        },
        executionTimeMs: cloudResults.executionTimeMs,
        distribution
      },
      mockConfig,
      '', // configDir (not needed for cloud results)
      cloudResults.policyCount,
      {
        executionMode: 'cloud'
      }
    );
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === 1; // OPEN = 1
  }
}
