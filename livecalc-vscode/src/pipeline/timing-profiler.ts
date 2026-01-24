/**
 * Timing Profiler for Pipeline Execution
 *
 * Collects, analyzes, and visualizes timing data for each node in the pipeline.
 * Identifies bottlenecks and provides comparison across runs.
 *
 * @module pipeline/timing-profiler
 */

import * as vscode from 'vscode';
import { logger } from '../logging/logger';

/**
 * Detailed timing breakdown for a single node execution
 */
export interface NodeTimingDetail {
  /** Node ID */
  nodeId: string;
  /** Node name */
  nodeName: string;
  /** Engine type (wasm/python) */
  engineType: 'wasm' | 'python';
  /** Wait time (waiting for upstream dependencies) in ms */
  waitTimeMs: number;
  /** Init time (engine initialization) in ms */
  initTimeMs: number;
  /** Execute time (actual computation) in ms */
  executeTimeMs: number;
  /** Handoff time (signaling downstream) in ms */
  handoffTimeMs: number;
  /** Total time from start to completion in ms */
  totalTimeMs: number;
  /** Start timestamp (ms since epoch) */
  startTime: number;
  /** End timestamp (ms since epoch) */
  endTime: number;
}

/**
 * Pipeline timing summary for a single run
 */
export interface PipelineTimingSummary {
  /** Run ID for cross-run comparison */
  runId: string;
  /** Total pipeline execution time in ms */
  totalTimeMs: number;
  /** Time spent in initialization across all nodes in ms */
  totalInitTimeMs: number;
  /** Time spent in execution across all nodes in ms */
  totalExecuteTimeMs: number;
  /** Time spent in handoffs across all nodes in ms */
  totalHandoffTimeMs: number;
  /** Time spent waiting across all nodes in ms */
  totalWaitTimeMs: number;
  /** Slowest node ID */
  slowestNodeId: string;
  /** Slowest node time in ms */
  slowestNodeTimeMs: number;
  /** Per-node timing details */
  nodeTimings: NodeTimingDetail[];
  /** Timestamp of run */
  timestamp: number;
  /** Whether nodes executed in parallel */
  hasParallelExecution: boolean;
  /** Critical path (longest sequential chain) in ms */
  criticalPathMs: number;
}

/**
 * Timing comparison between two runs
 */
export interface TimingComparison {
  /** Baseline run ID */
  baselineRunId: string;
  /** Current run ID */
  currentRunId: string;
  /** Total time delta (current - baseline) in ms */
  totalTimeDeltaMs: number;
  /** Total time delta as percentage */
  totalTimeDeltaPercent: number;
  /** Per-node timing deltas */
  nodeDeltas: Array<{
    nodeId: string;
    nodeName: string;
    baselineMs: number;
    currentMs: number;
    deltaMs: number;
    deltaPercent: number;
  }>;
  /** Nodes that became slower */
  slowerNodes: string[];
  /** Nodes that became faster */
  fasterNodes: string[];
  /** Timestamp of comparison */
  timestamp: number;
}

/**
 * Waterfall chart data for visualization
 */
export interface WaterfallData {
  /** Pipeline run ID */
  runId: string;
  /** Waterfall bars for each node */
  bars: Array<{
    nodeId: string;
    nodeName: string;
    startMs: number;
    durationMs: number;
    stage: 'wait' | 'init' | 'execute' | 'handoff';
    color: string;
  }>;
  /** Total duration in ms */
  totalDurationMs: number;
  /** Whether nodes executed in parallel */
  hasParallelExecution: boolean;
}

/**
 * Timing Profiler manages timing data collection and analysis for pipeline execution
 */
export class TimingProfiler implements vscode.Disposable {
  private static instance: TimingProfiler | undefined;

  private readonly historySize = 10; // Keep last 10 runs for comparison
  private readonly history: PipelineTimingSummary[] = [];

  private currentRunId: string | undefined;
  private currentNodeTimings: Map<string, NodeTimingDetail> = new Map();
  private pipelineStartTime: number | undefined;

  private constructor() {
    logger.debug('TimingProfiler initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): TimingProfiler {
    if (!TimingProfiler.instance) {
      TimingProfiler.instance = new TimingProfiler();
    }
    return TimingProfiler.instance;
  }

  /**
   * Dispose singleton instance
   */
  public static disposeInstance(): void {
    if (TimingProfiler.instance) {
      TimingProfiler.instance.dispose();
      TimingProfiler.instance = undefined;
    }
  }

  /**
   * Start a new pipeline run
   * @param runId Unique run identifier
   */
  public startRun(runId: string): void {
    this.currentRunId = runId;
    this.currentNodeTimings.clear();
    this.pipelineStartTime = Date.now();
    logger.debug(`TimingProfiler: Started run ${runId}`);
  }

  /**
   * Record timing for a node
   * @param nodeId Node ID
   * @param nodeName Node name
   * @param engineType Engine type
   * @param timing Timing breakdown
   * @param startTime Node start timestamp
   * @param endTime Node end timestamp
   */
  public recordNodeTiming(
    nodeId: string,
    nodeName: string,
    engineType: 'wasm' | 'python',
    timing: {
      waitTimeMs: number;
      initTimeMs: number;
      executeTimeMs: number;
      handoffTimeMs: number;
      totalTimeMs: number;
    },
    startTime: number,
    endTime: number
  ): void {
    if (!this.currentRunId) {
      logger.warn('TimingProfiler: recordNodeTiming called without active run');
      return;
    }

    const detail: NodeTimingDetail = {
      nodeId,
      nodeName,
      engineType,
      ...timing,
      startTime,
      endTime,
    };

    this.currentNodeTimings.set(nodeId, detail);
    logger.debug(`TimingProfiler: Recorded timing for node ${nodeId}: ${timing.totalTimeMs}ms`);
  }

  /**
   * Complete the current run and generate summary
   * @returns Pipeline timing summary
   */
  public completeRun(): PipelineTimingSummary | undefined {
    if (!this.currentRunId || !this.pipelineStartTime) {
      logger.warn('TimingProfiler: completeRun called without active run');
      return undefined;
    }

    const nodeTimings = Array.from(this.currentNodeTimings.values());
    if (nodeTimings.length === 0) {
      logger.warn('TimingProfiler: No node timings recorded');
      return undefined;
    }

    // Calculate totals
    const totalInitTimeMs = nodeTimings.reduce((sum, t) => sum + t.initTimeMs, 0);
    const totalExecuteTimeMs = nodeTimings.reduce((sum, t) => sum + t.executeTimeMs, 0);
    const totalHandoffTimeMs = nodeTimings.reduce((sum, t) => sum + t.handoffTimeMs, 0);
    const totalWaitTimeMs = nodeTimings.reduce((sum, t) => sum + t.waitTimeMs, 0);

    // Find slowest node
    const slowestNode = nodeTimings.reduce((max, t) =>
      t.totalTimeMs > max.totalTimeMs ? t : max
    );

    // Calculate actual wall-clock time
    const pipelineEndTime = Date.now();
    const totalTimeMs = pipelineEndTime - this.pipelineStartTime;

    // Check for parallel execution (wall-clock < sum of all node times)
    const sumOfNodeTimes = nodeTimings.reduce((sum, t) => sum + t.totalTimeMs, 0);
    const hasParallelExecution = totalTimeMs < sumOfNodeTimes * 0.95; // 5% tolerance

    // Calculate critical path (longest sequential chain)
    const criticalPathMs = this.calculateCriticalPath(nodeTimings);

    const summary: PipelineTimingSummary = {
      runId: this.currentRunId,
      totalTimeMs,
      totalInitTimeMs,
      totalExecuteTimeMs,
      totalHandoffTimeMs,
      totalWaitTimeMs,
      slowestNodeId: slowestNode.nodeId,
      slowestNodeTimeMs: slowestNode.totalTimeMs,
      nodeTimings,
      timestamp: this.pipelineStartTime,
      hasParallelExecution,
      criticalPathMs,
    };

    // Add to history
    this.history.push(summary);
    if (this.history.length > this.historySize) {
      this.history.shift();
    }

    logger.info(`TimingProfiler: Pipeline run ${this.currentRunId} completed in ${totalTimeMs}ms`);
    logger.debug(`  - Init: ${totalInitTimeMs}ms, Execute: ${totalExecuteTimeMs}ms, Handoff: ${totalHandoffTimeMs}ms`);
    logger.debug(`  - Slowest node: ${slowestNode.nodeId} (${slowestNode.totalTimeMs}ms)`);
    logger.debug(`  - Parallel execution: ${hasParallelExecution}, Critical path: ${criticalPathMs}ms`);

    // Reset for next run
    this.currentRunId = undefined;
    this.currentNodeTimings.clear();
    this.pipelineStartTime = undefined;

    return summary;
  }

  /**
   * Calculate critical path (longest sequential chain) through the DAG
   * For now, uses max node time as approximation (full DAG analysis would require topology)
   */
  private calculateCriticalPath(nodeTimings: NodeTimingDetail[]): number {
    // Simplified: use the max total time of any node
    // In a full implementation, this would traverse the DAG to find the longest path
    return Math.max(...nodeTimings.map(t => t.totalTimeMs));
  }

  /**
   * Get timing summary for a specific run
   * @param runId Run ID
   * @returns Timing summary or undefined if not found
   */
  public getSummary(runId: string): PipelineTimingSummary | undefined {
    return this.history.find(h => h.runId === runId);
  }

  /**
   * Get the most recent timing summary
   * @returns Most recent timing summary or undefined
   */
  public getMostRecent(): PipelineTimingSummary | undefined {
    return this.history[this.history.length - 1];
  }

  /**
   * Get all timing history
   * @returns Array of timing summaries
   */
  public getHistory(): PipelineTimingSummary[] {
    return [...this.history];
  }

  /**
   * Compare two runs
   * @param currentRunId Current run ID
   * @param baselineRunId Baseline run ID (defaults to previous run)
   * @returns Timing comparison or undefined if runs not found
   */
  public compareRuns(
    currentRunId: string,
    baselineRunId?: string
  ): TimingComparison | undefined {
    const current = this.getSummary(currentRunId);
    if (!current) {
      logger.warn(`TimingProfiler: Current run ${currentRunId} not found`);
      return undefined;
    }

    // If no baseline specified, use previous run
    if (!baselineRunId) {
      const currentIndex = this.history.findIndex(h => h.runId === currentRunId);
      if (currentIndex > 0) {
        baselineRunId = this.history[currentIndex - 1].runId;
      }
    }

    const baseline = baselineRunId ? this.getSummary(baselineRunId) : undefined;
    if (!baseline) {
      logger.warn(`TimingProfiler: Baseline run ${baselineRunId} not found`);
      return undefined;
    }

    // Calculate deltas
    const totalTimeDeltaMs = current.totalTimeMs - baseline.totalTimeMs;
    const totalTimeDeltaPercent = (totalTimeDeltaMs / baseline.totalTimeMs) * 100;

    // Per-node deltas
    const nodeDeltas: TimingComparison['nodeDeltas'] = [];
    const slowerNodes: string[] = [];
    const fasterNodes: string[] = [];

    for (const currentNode of current.nodeTimings) {
      const baselineNode = baseline.nodeTimings.find(n => n.nodeId === currentNode.nodeId);
      if (baselineNode) {
        const deltaMs = currentNode.totalTimeMs - baselineNode.totalTimeMs;
        const deltaPercent = (deltaMs / baselineNode.totalTimeMs) * 100;

        nodeDeltas.push({
          nodeId: currentNode.nodeId,
          nodeName: currentNode.nodeName,
          baselineMs: baselineNode.totalTimeMs,
          currentMs: currentNode.totalTimeMs,
          deltaMs,
          deltaPercent,
        });

        if (deltaMs > 5) { // 5ms threshold
          slowerNodes.push(currentNode.nodeId);
        } else if (deltaMs < -5) {
          fasterNodes.push(currentNode.nodeId);
        }
      }
    }

    const comparison: TimingComparison = {
      baselineRunId: baseline.runId,
      currentRunId: current.runId,
      totalTimeDeltaMs,
      totalTimeDeltaPercent,
      nodeDeltas,
      slowerNodes,
      fasterNodes,
      timestamp: Date.now(),
    };

    logger.debug(`TimingProfiler: Comparison ${current.runId} vs ${baseline.runId}: ${totalTimeDeltaMs > 0 ? '+' : ''}${totalTimeDeltaMs.toFixed(0)}ms (${totalTimeDeltaPercent > 0 ? '+' : ''}${totalTimeDeltaPercent.toFixed(1)}%)`);

    return comparison;
  }

  /**
   * Generate waterfall chart data for visualization
   * @param runId Run ID (defaults to most recent)
   * @returns Waterfall data or undefined if run not found
   */
  public generateWaterfallData(runId?: string): WaterfallData | undefined {
    const summary = runId ? this.getSummary(runId) : this.getMostRecent();
    if (!summary) {
      logger.warn(`TimingProfiler: Run ${runId || 'most recent'} not found`);
      return undefined;
    }

    const bars: WaterfallData['bars'] = [];

    // For each node, create bars for each stage
    for (const node of summary.nodeTimings) {
      let cumulativeMs = node.startTime - summary.timestamp;

      // Wait stage
      if (node.waitTimeMs > 0) {
        bars.push({
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          startMs: cumulativeMs,
          durationMs: node.waitTimeMs,
          stage: 'wait',
          color: '#6c757d', // gray
        });
        cumulativeMs += node.waitTimeMs;
      }

      // Init stage
      if (node.initTimeMs > 0) {
        bars.push({
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          startMs: cumulativeMs,
          durationMs: node.initTimeMs,
          stage: 'init',
          color: '#ffc107', // amber
        });
        cumulativeMs += node.initTimeMs;
      }

      // Execute stage (main computation)
      bars.push({
        nodeId: node.nodeId,
        nodeName: node.nodeName,
        startMs: cumulativeMs,
        durationMs: node.executeTimeMs,
        stage: 'execute',
        color: '#0d6efd', // blue
      });
      cumulativeMs += node.executeTimeMs;

      // Handoff stage
      if (node.handoffTimeMs > 0) {
        bars.push({
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          startMs: cumulativeMs,
          durationMs: node.handoffTimeMs,
          stage: 'handoff',
          color: '#198754', // green
        });
      }
    }

    return {
      runId: summary.runId,
      bars,
      totalDurationMs: summary.totalTimeMs,
      hasParallelExecution: summary.hasParallelExecution,
    };
  }

  /**
   * Export timing data as JSON
   * @param runId Run ID (defaults to most recent)
   * @returns JSON string or undefined if run not found
   */
  public exportToJson(runId?: string): string | undefined {
    const summary = runId ? this.getSummary(runId) : this.getMostRecent();
    if (!summary) {
      return undefined;
    }

    return JSON.stringify(summary, null, 2);
  }

  /**
   * Export all timing history as JSON
   * @returns JSON string
   */
  public exportAllToJson(): string {
    return JSON.stringify(this.history, null, 2);
  }

  /**
   * Clear all timing history
   */
  public clearHistory(): void {
    this.history.length = 0;
    logger.info('TimingProfiler: History cleared');
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.clearHistory();
    this.currentNodeTimings.clear();
    logger.debug('TimingProfiler disposed');
  }
}
