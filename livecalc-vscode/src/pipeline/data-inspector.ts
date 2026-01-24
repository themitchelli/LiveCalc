import * as vscode from 'vscode';
import { logger } from '../logging/logger';

/**
 * Bus resource data snapshot from orchestrator
 */
export interface BusResourceSnapshot {
  /** Resource name (bus://category/name) */
  name: string;
  /** Float64 data array */
  data: number[];
  /** Size in bytes */
  sizeBytes: number;
  /** Data type (e.g., 'Float64Array') */
  dataType: string;
  /** Element count */
  elementCount: number;
  /** CRC32 checksum (if integrity checks enabled) */
  checksum?: number;
  /** Timestamp when snapshot was taken (nanoseconds) */
  timestamp?: number;
}

/**
 * Pipeline data state containing all bus resources
 */
export interface PipelineDataState {
  /** All bus resources available for inspection */
  resources: BusResourceSnapshot[];
  /** Execution timestamp */
  executionTimestamp: number;
  /** Pipeline run ID */
  runId: string;
}

/**
 * Statistics for intermediate data
 */
export interface IntermediateDataStatistics {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  count: number;
}

/**
 * Histogram data for intermediate data visualization
 */
export interface IntermediateHistogramData {
  bins: { min: number; max: number; count: number; center: number }[];
  binWidth: number;
  totalCount: number;
}

/**
 * Manages pipeline intermediate data inspection and snapshots
 */
export class PipelineDataInspector implements vscode.Disposable {
  private snapshots: Map<string, PipelineDataState[]> = new Map(); // runId -> snapshots
  private maxSnapshotsPerRun: number = 10; // Keep last N snapshots for time-travel
  private disposables: vscode.Disposable[] = [];

  constructor() {
    logger.debug('PipelineDataInspector initialized');
  }

  /**
   * Store a pipeline data snapshot
   */
  public storeSnapshot(state: PipelineDataState): void {
    const runId = state.runId;

    // Get existing snapshots for this run
    let runSnapshots = this.snapshots.get(runId);
    if (!runSnapshots) {
      runSnapshots = [];
      this.snapshots.set(runId, runSnapshots);
    }

    // Add new snapshot
    runSnapshots.push(state);

    // Keep only last N snapshots
    if (runSnapshots.length > this.maxSnapshotsPerRun) {
      runSnapshots.shift();
    }

    logger.debug(`Stored pipeline snapshot for run ${runId}, total snapshots: ${runSnapshots.length}`);
  }

  /**
   * Get all snapshots for a run (for time-travel debugging)
   */
  public getSnapshots(runId: string): PipelineDataState[] {
    return this.snapshots.get(runId) || [];
  }

  /**
   * Get the latest snapshot for a run
   */
  public getLatestSnapshot(runId: string): PipelineDataState | undefined {
    const snapshots = this.snapshots.get(runId);
    return snapshots && snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined;
  }

  /**
   * Get a specific bus resource from latest snapshot
   */
  public getResource(runId: string, resourceName: string): BusResourceSnapshot | undefined {
    const snapshot = this.getLatestSnapshot(runId);
    if (!snapshot) {
      return undefined;
    }
    return snapshot.resources.find((r) => r.name === resourceName);
  }

  /**
   * Calculate statistics for a bus resource
   */
  public calculateStatistics(data: number[]): IntermediateDataStatistics {
    if (data.length === 0) {
      return {
        mean: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        count: 0,
      };
    }

    // Sort for percentiles
    const sorted = [...data].sort((a, b) => a - b);
    const count = sorted.length;

    // Mean
    const mean = sorted.reduce((sum, val) => sum + val, 0) / count;

    // Standard deviation
    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    // Percentiles
    const percentile = (p: number): number => {
      const index = (p / 100) * (count - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index - lower;
      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    return {
      mean,
      stdDev,
      min: sorted[0],
      max: sorted[count - 1],
      p25: percentile(25),
      p50: percentile(50),
      p75: percentile(75),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99),
      count,
    };
  }

  /**
   * Generate histogram data for a bus resource
   */
  public calculateHistogram(data: number[], binCount: number = 50): IntermediateHistogramData {
    if (data.length === 0) {
      return { bins: [], binWidth: 0, totalCount: 0 };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / binCount;

    // Initialize bins
    const bins: { min: number; max: number; count: number; center: number }[] = [];
    for (let i = 0; i < binCount; i++) {
      const binMin = min + i * binWidth;
      const binMax = binMin + binWidth;
      bins.push({
        min: binMin,
        max: binMax,
        count: 0,
        center: (binMin + binMax) / 2,
      });
    }

    // Populate bins
    for (const value of data) {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
      bins[binIndex].count++;
    }

    return {
      bins,
      binWidth,
      totalCount: data.length,
    };
  }

  /**
   * Export bus resource to CSV format
   */
  public exportResourceToCsv(resource: BusResourceSnapshot): string {
    const lines: string[] = [];

    // Header with metadata
    lines.push(`# Bus Resource: ${resource.name}`);
    lines.push(`# Element Count: ${resource.elementCount}`);
    lines.push(`# Data Type: ${resource.dataType}`);
    lines.push(`# Size: ${resource.sizeBytes} bytes`);
    if (resource.checksum !== undefined) {
      lines.push(`# Checksum (CRC32): ${resource.checksum.toString(16).padStart(8, '0')}`);
    }
    if (resource.timestamp !== undefined) {
      lines.push(`# Timestamp: ${resource.timestamp}ns`);
    }
    lines.push('');

    // Column headers
    lines.push('index,value');

    // Data rows
    for (let i = 0; i < resource.data.length; i++) {
      lines.push(`${i},${resource.data[i]}`);
    }

    return lines.join('\n');
  }

  /**
   * Get a slice of data for paginated table view
   */
  public getDataSlice(data: number[], offset: number, limit: number): { index: number; value: number }[] {
    const slice: { index: number; value: number }[] = [];
    const end = Math.min(offset + limit, data.length);

    for (let i = offset; i < end; i++) {
      slice.push({ index: i, value: data[i] });
    }

    return slice;
  }

  /**
   * Compare two bus resources and calculate differences
   */
  public compareResources(
    resourceA: BusResourceSnapshot,
    resourceB: BusResourceSnapshot
  ): {
    differences: { index: number; valueA: number; valueB: number; diff: number }[];
    summary: {
      totalDifferences: number;
      maxAbsDiff: number;
      meanAbsDiff: number;
      diffPercentage: number;
    };
  } {
    const differences: { index: number; valueA: number; valueB: number; diff: number }[] = [];
    const minLength = Math.min(resourceA.data.length, resourceB.data.length);

    let totalAbsDiff = 0;
    let maxAbsDiff = 0;

    for (let i = 0; i < minLength; i++) {
      const diff = resourceA.data[i] - resourceB.data[i];
      const absDiff = Math.abs(diff);

      if (absDiff > 0.001) {
        // Only track significant differences
        differences.push({
          index: i,
          valueA: resourceA.data[i],
          valueB: resourceB.data[i],
          diff,
        });
      }

      totalAbsDiff += absDiff;
      maxAbsDiff = Math.max(maxAbsDiff, absDiff);
    }

    return {
      differences,
      summary: {
        totalDifferences: differences.length,
        maxAbsDiff,
        meanAbsDiff: totalAbsDiff / minLength,
        diffPercentage: (differences.length / minLength) * 100,
      },
    };
  }

  /**
   * Clear all snapshots
   */
  public clear(): void {
    this.snapshots.clear();
    logger.debug('Cleared all pipeline data snapshots');
  }

  /**
   * Clear snapshots for a specific run
   */
  public clearRun(runId: string): void {
    this.snapshots.delete(runId);
    logger.debug(`Cleared snapshots for run ${runId}`);
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.snapshots.clear();
    this.disposables.forEach((d) => d.dispose());
    logger.debug('PipelineDataInspector disposed');
  }
}
