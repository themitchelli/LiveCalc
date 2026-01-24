/**
 * Pipeline Error Handling
 *
 * Provides structured error types and error handling utilities for pipeline execution.
 * Errors capture full context including node state, input snapshots, and stack traces
 * to enable efficient debugging.
 *
 * @module orchestrator/pipeline-error
 */

import { NodeState, NODE_STATE_NAMES, type AtomicSignalManager, type MessageBasedSignalManager } from './atomic-signals.js';
import type { MemoryBlock, MemoryOffsetMap } from './memory-manager.js';

/**
 * Stage of pipeline execution where error occurred
 */
export type PipelineStage = 'init' | 'load' | 'execute' | 'finalize' | 'handoff';

/**
 * Error severity levels
 */
export type PipelineErrorSeverity = 'fatal' | 'error' | 'warning';

/**
 * Snapshot of bus:// data at time of error
 */
export interface BusDataSnapshot {
  /** Bus resource name */
  name: string;
  /** First N values (for debugging) */
  sample: number[];
  /** Total element count */
  elementCount: number;
  /** Min value in the data */
  min?: number;
  /** Max value in the data */
  max?: number;
  /** Mean value in the data */
  mean?: number;
  /** Checksum at time of snapshot (if integrity checks enabled) */
  checksum?: number;
}

/**
 * Input snapshot at time of error
 */
export interface InputSnapshot {
  /** Map of input name to data snapshot */
  inputs: Map<string, BusDataSnapshot>;
  /** Map of output name to data snapshot (partial results) */
  outputs: Map<string, BusDataSnapshot>;
  /** Timestamp when snapshot was taken */
  timestamp: number;
}

/**
 * Structured pipeline error with full context
 */
export interface PipelineErrorInfo {
  /** Unique error ID for tracking */
  errorId: string;
  /** Node ID where error occurred */
  nodeId: string;
  /** Stage of execution (init, load, execute, finalize, handoff) */
  stage: PipelineStage;
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code: PipelineErrorCode;
  /** Error severity */
  severity: PipelineErrorSeverity;
  /** Original error if wrapping an exception */
  cause?: Error;
  /** Stack trace (if available) */
  stack?: string;
  /** Snapshot of bus data at time of failure */
  inputSnapshot?: InputSnapshot;
  /** Node state at time of error */
  nodeState?: NodeState;
  /** All node states at time of error */
  allNodeStates?: Record<string, NodeState>;
  /** Timestamp of error */
  timestamp: number;
  /** Execution time before error (ms) */
  executionTimeMs?: number;
  /** Actionable guidance for fixing the error */
  guidance?: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Error codes for pipeline execution errors
 */
export enum PipelineErrorCode {
  // Initialization errors
  ENGINE_INIT_FAILED = 'ENGINE_INIT_FAILED',
  ENGINE_NOT_FOUND = 'ENGINE_NOT_FOUND',
  MEMORY_ALLOCATION_FAILED = 'MEMORY_ALLOCATION_FAILED',
  WORKER_INIT_FAILED = 'WORKER_INIT_FAILED',

  // Data loading errors
  DATA_LOAD_FAILED = 'DATA_LOAD_FAILED',
  INVALID_INPUT_FORMAT = 'INVALID_INPUT_FORMAT',
  MISSING_REQUIRED_INPUT = 'MISSING_REQUIRED_INPUT',
  INPUT_SIZE_MISMATCH = 'INPUT_SIZE_MISMATCH',

  // Execution errors
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  TIMEOUT = 'TIMEOUT',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  NUMERICAL_ERROR = 'NUMERICAL_ERROR',
  ASSERTION_FAILED = 'ASSERTION_FAILED',

  // Handoff errors
  HANDOFF_FAILED = 'HANDOFF_FAILED',
  UPSTREAM_TIMEOUT = 'UPSTREAM_TIMEOUT',
  UPSTREAM_ERROR = 'UPSTREAM_ERROR',
  INTEGRITY_CHECK_FAILED = 'INTEGRITY_CHECK_FAILED',

  // Finalization errors
  OUTPUT_WRITE_FAILED = 'OUTPUT_WRITE_FAILED',
  OUTPUT_SIZE_MISMATCH = 'OUTPUT_SIZE_MISMATCH',

  // Cancellation
  CANCELLED = 'CANCELLED',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}

/**
 * Error code to guidance mapping
 */
const ERROR_GUIDANCE: Record<PipelineErrorCode, string> = {
  [PipelineErrorCode.ENGINE_INIT_FAILED]:
    'Check that the engine module is correctly built and accessible. Verify WASM files are present.',
  [PipelineErrorCode.ENGINE_NOT_FOUND]:
    'The specified engine was not found. Check the engine reference in your pipeline config.',
  [PipelineErrorCode.MEMORY_ALLOCATION_FAILED]:
    'Memory allocation failed. Try reducing the dataset size or number of scenarios.',
  [PipelineErrorCode.WORKER_INIT_FAILED]:
    'Worker initialization failed. Check browser console for worker-specific errors.',
  [PipelineErrorCode.DATA_LOAD_FAILED]:
    'Failed to load input data. Verify the data format and file paths.',
  [PipelineErrorCode.INVALID_INPUT_FORMAT]:
    'Input data format is invalid. Check that CSV columns match expected schema.',
  [PipelineErrorCode.MISSING_REQUIRED_INPUT]:
    'A required input is missing. Ensure all inputs declared in the pipeline are provided.',
  [PipelineErrorCode.INPUT_SIZE_MISMATCH]:
    'Input size does not match expected dimensions. Verify data row/column counts.',
  [PipelineErrorCode.EXECUTION_FAILED]:
    'Engine execution failed. Check the error details for specific cause.',
  [PipelineErrorCode.TIMEOUT]:
    'Operation timed out. Consider breaking the workload into smaller chunks.',
  [PipelineErrorCode.OUT_OF_MEMORY]:
    'Out of memory during execution. Reduce dataset size or enable chunked processing.',
  [PipelineErrorCode.NUMERICAL_ERROR]:
    'Numerical computation error (NaN/Infinity). Check input data for invalid values.',
  [PipelineErrorCode.ASSERTION_FAILED]:
    'Internal assertion failed. This may indicate a bug in the engine.',
  [PipelineErrorCode.HANDOFF_FAILED]:
    'Failed to hand off data between pipeline nodes. Check atomic signal state.',
  [PipelineErrorCode.UPSTREAM_TIMEOUT]:
    'Upstream node did not complete in time. Check for bottlenecks or increase timeout.',
  [PipelineErrorCode.UPSTREAM_ERROR]:
    'An upstream node failed. Fix the upstream error first.',
  [PipelineErrorCode.INTEGRITY_CHECK_FAILED]:
    'Data integrity check failed. Bus data may have been corrupted.',
  [PipelineErrorCode.OUTPUT_WRITE_FAILED]:
    'Failed to write output to bus. Check memory allocation.',
  [PipelineErrorCode.OUTPUT_SIZE_MISMATCH]:
    'Output size does not match expected dimensions.',
  [PipelineErrorCode.CANCELLED]:
    'Operation was cancelled by user or system.',
  [PipelineErrorCode.UNKNOWN]:
    'An unknown error occurred. Check the error details and stack trace.',
};

/**
 * Pipeline execution error class
 */
export class PipelineError extends Error {
  public readonly info: PipelineErrorInfo;

  constructor(info: Partial<PipelineErrorInfo> & { nodeId: string; message: string }) {
    super(info.message);
    this.name = 'PipelineError';

    this.info = {
      errorId: info.errorId ?? generateErrorId(),
      nodeId: info.nodeId,
      stage: info.stage ?? 'execute',
      message: info.message,
      code: info.code ?? PipelineErrorCode.UNKNOWN,
      severity: info.severity ?? 'error',
      cause: info.cause,
      stack: info.stack ?? (info.cause?.stack ?? this.stack),
      inputSnapshot: info.inputSnapshot,
      nodeState: info.nodeState,
      allNodeStates: info.allNodeStates,
      timestamp: info.timestamp ?? Date.now(),
      executionTimeMs: info.executionTimeMs,
      guidance: info.guidance ?? ERROR_GUIDANCE[info.code ?? PipelineErrorCode.UNKNOWN],
      details: info.details,
    };

    // Preserve original stack if wrapping another error
    if (info.cause?.stack) {
      this.stack = `${this.stack}\nCaused by: ${info.cause.stack}`;
    }
  }

  /**
   * Create a PipelineError from an unknown error
   */
  static from(
    error: unknown,
    nodeId: string,
    stage: PipelineStage,
    context?: Partial<PipelineErrorInfo>
  ): PipelineError {
    if (error instanceof PipelineError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;
    const code = classifyError(error);

    return new PipelineError({
      nodeId,
      stage,
      message,
      code,
      cause,
      ...context,
    });
  }

  /**
   * Get a JSON-serializable representation
   */
  toJSON(): Record<string, unknown> {
    return {
      errorId: this.info.errorId,
      nodeId: this.info.nodeId,
      stage: this.info.stage,
      message: this.info.message,
      code: this.info.code,
      severity: this.info.severity,
      stack: this.info.stack,
      nodeState: this.info.nodeState
        ? NODE_STATE_NAMES[this.info.nodeState]
        : undefined,
      allNodeStates: this.info.allNodeStates
        ? Object.fromEntries(
            Object.entries(this.info.allNodeStates).map(([k, v]) => [k, NODE_STATE_NAMES[v]])
          )
        : undefined,
      timestamp: this.info.timestamp,
      executionTimeMs: this.info.executionTimeMs,
      guidance: this.info.guidance,
      details: this.info.details,
    };
  }
}

/**
 * Classify an error into a PipelineErrorCode
 */
function classifyError(error: unknown): PipelineErrorCode {
  if (!(error instanceof Error)) {
    return PipelineErrorCode.UNKNOWN;
  }

  const message = error.message.toLowerCase();

  // Memory errors
  if (
    message.includes('out of memory') ||
    message.includes('memory') ||
    message.includes('allocation')
  ) {
    return PipelineErrorCode.OUT_OF_MEMORY;
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return PipelineErrorCode.TIMEOUT;
  }

  // Numerical errors
  if (message.includes('nan') || message.includes('infinity') || message.includes('overflow')) {
    return PipelineErrorCode.NUMERICAL_ERROR;
  }

  // Cancelled
  if (message.includes('cancelled') || message.includes('canceled') || message.includes('abort')) {
    return PipelineErrorCode.CANCELLED;
  }

  // Init errors
  if (message.includes('init') || message.includes('module')) {
    return PipelineErrorCode.ENGINE_INIT_FAILED;
  }

  // Data errors
  if (message.includes('format') || message.includes('parse')) {
    return PipelineErrorCode.INVALID_INPUT_FORMAT;
  }

  if (message.includes('missing') || message.includes('not found')) {
    return PipelineErrorCode.MISSING_REQUIRED_INPUT;
  }

  if (message.includes('size') || message.includes('length') || message.includes('dimension')) {
    return PipelineErrorCode.INPUT_SIZE_MISMATCH;
  }

  return PipelineErrorCode.EXECUTION_FAILED;
}

/**
 * Generate a unique error ID
 */
function generateErrorId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `err_${timestamp}_${random}`;
}

/**
 * PipelineErrorHandler collects and manages errors during pipeline execution
 */
export class PipelineErrorHandler {
  private _errors: PipelineError[] = [];
  private _continueOnError: boolean;
  private _maxErrors: number;
  private _logger: ((message: string, ...args: unknown[]) => void) | null = null;

  constructor(options: { continueOnError?: boolean; maxErrors?: number } = {}) {
    this._continueOnError = options.continueOnError ?? false;
    this._maxErrors = options.maxErrors ?? 10;
  }

  /**
   * Set a logger function for debug output
   */
  setLogger(logger: (message: string, ...args: unknown[]) => void): void {
    this._logger = logger;
  }

  private log(message: string, ...args: unknown[]): void {
    if (this._logger) {
      this._logger(`[PipelineErrorHandler] ${message}`, ...args);
    }
  }

  /**
   * Whether to continue execution after errors
   */
  get continueOnError(): boolean {
    return this._continueOnError;
  }

  /**
   * Handle an error from a pipeline node
   *
   * @throws PipelineError if continueOnError is false
   */
  handleError(
    error: unknown,
    nodeId: string,
    stage: PipelineStage,
    context?: Partial<PipelineErrorInfo>
  ): PipelineError {
    const pipelineError = PipelineError.from(error, nodeId, stage, context);

    this._errors.push(pipelineError);
    this.log(
      `Error in node "${nodeId}" at stage "${stage}": ${pipelineError.info.message}`
    );

    // Limit stored errors
    if (this._errors.length > this._maxErrors) {
      this._errors.shift();
    }

    // Throw if fail-fast mode
    if (!this._continueOnError) {
      throw pipelineError;
    }

    return pipelineError;
  }

  /**
   * Record an error without throwing
   */
  recordError(error: PipelineError): void {
    this._errors.push(error);
    if (this._errors.length > this._maxErrors) {
      this._errors.shift();
    }
  }

  /**
   * Get all recorded errors
   */
  getErrors(): readonly PipelineError[] {
    return [...this._errors];
  }

  /**
   * Get the first (primary) error
   */
  getPrimaryError(): PipelineError | undefined {
    return this._errors[0];
  }

  /**
   * Check if any errors have occurred
   */
  hasErrors(): boolean {
    return this._errors.length > 0;
  }

  /**
   * Get error count
   */
  get errorCount(): number {
    return this._errors.length;
  }

  /**
   * Clear all recorded errors
   */
  clearErrors(): void {
    this._errors = [];
  }

  /**
   * Create a snapshot of bus data for error context
   */
  createInputSnapshot(
    buffer: SharedArrayBuffer,
    offsetMap: MemoryOffsetMap,
    inputNames: string[],
    outputNames: string[],
    sampleSize: number = 10
  ): InputSnapshot {
    const inputs = new Map<string, BusDataSnapshot>();
    const outputs = new Map<string, BusDataSnapshot>();

    // Snapshot inputs
    for (const name of inputNames) {
      const snapshot = this.snapshotBlock(buffer, offsetMap, name, sampleSize);
      if (snapshot) {
        inputs.set(name, snapshot);
      }
    }

    // Snapshot outputs (partial results)
    for (const name of outputNames) {
      const snapshot = this.snapshotBlock(buffer, offsetMap, name, sampleSize);
      if (snapshot) {
        outputs.set(name, snapshot);
      }
    }

    return {
      inputs,
      outputs,
      timestamp: Date.now(),
    };
  }

  /**
   * Snapshot a single memory block
   */
  private snapshotBlock(
    buffer: SharedArrayBuffer,
    offsetMap: MemoryOffsetMap,
    busName: string,
    sampleSize: number
  ): BusDataSnapshot | null {
    const block = offsetMap.blocksByName.get(busName);
    if (!block) {
      return null;
    }

    try {
      const view = new Float64Array(buffer, block.offset, block.elementCount);
      const sample = Array.from(view.slice(0, sampleSize));

      // Calculate statistics
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let validCount = 0;

      for (let i = 0; i < view.length; i++) {
        const val = view[i];
        if (Number.isFinite(val)) {
          min = Math.min(min, val);
          max = Math.max(max, val);
          sum += val;
          validCount++;
        }
      }

      const mean = validCount > 0 ? sum / validCount : undefined;

      return {
        name: busName,
        sample,
        elementCount: block.elementCount,
        min: Number.isFinite(min) ? min : undefined,
        max: Number.isFinite(max) ? max : undefined,
        mean,
        checksum: block.checksum,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all node states for error context
   */
  getAllNodeStates(
    signalManager: AtomicSignalManager | MessageBasedSignalManager
  ): Record<string, NodeState> {
    const states: Record<string, NodeState> = {};
    for (const nodeId of signalManager.nodeIds) {
      states[nodeId] = signalManager.getState(nodeId);
    }
    return states;
  }

  /**
   * Create a summary of errors for display
   */
  createErrorSummary(): {
    totalErrors: number;
    primaryError?: {
      nodeId: string;
      stage: PipelineStage;
      message: string;
      code: PipelineErrorCode;
      guidance: string;
    };
    affectedNodes: string[];
    errorsByStage: Record<PipelineStage, number>;
  } {
    const errorsByStage: Record<PipelineStage, number> = {
      init: 0,
      load: 0,
      execute: 0,
      finalize: 0,
      handoff: 0,
    };

    const affectedNodes = new Set<string>();

    for (const error of this._errors) {
      errorsByStage[error.info.stage]++;
      affectedNodes.add(error.info.nodeId);
    }

    const primary = this._errors[0];

    return {
      totalErrors: this._errors.length,
      primaryError: primary
        ? {
            nodeId: primary.info.nodeId,
            stage: primary.info.stage,
            message: primary.info.message,
            code: primary.info.code,
            guidance: primary.info.guidance ?? ERROR_GUIDANCE[primary.info.code],
          }
        : undefined,
      affectedNodes: Array.from(affectedNodes),
      errorsByStage,
    };
  }
}

/**
 * Pipeline execution result with partial results and error info
 */
export interface PipelineExecutionResult<T = unknown> {
  /** Whether execution completed successfully */
  success: boolean;
  /** Result data (may be partial if errors occurred) */
  result?: T;
  /** Partial results per node (available even on failure if continueOnError) */
  partialResults: Map<string, NodeExecutionResult>;
  /** Error info if execution failed */
  error?: PipelineErrorInfo;
  /** All errors if continueOnError mode (may have multiple) */
  errors: PipelineErrorInfo[];
  /** Execution timing per node */
  timing: Map<string, NodeTiming>;
  /** Total execution time in milliseconds */
  totalTimeMs: number;
  /** Nodes that completed successfully */
  completedNodes: string[];
  /** Nodes that failed */
  failedNodes: string[];
  /** Nodes that were skipped (due to upstream failure) */
  skippedNodes: string[];
}

/**
 * Result from a single node execution
 */
export interface NodeExecutionResult {
  /** Node ID */
  nodeId: string;
  /** Whether node completed successfully */
  success: boolean;
  /** Node state at end of execution */
  state: NodeState;
  /** Output bus resources produced (names only, data in SAB) */
  outputs: string[];
  /** Error if node failed */
  error?: PipelineErrorInfo;
  /** Timing information */
  timing: NodeTiming;
}

/**
 * Timing information for a node
 */
export interface NodeTiming {
  /** Time spent waiting for upstream dependencies (ms) */
  waitTimeMs: number;
  /** Time spent initializing (ms) */
  initTimeMs: number;
  /** Time spent executing (ms) */
  executeTimeMs: number;
  /** Time for handoff to downstream (ms) */
  handoffTimeMs: number;
  /** Total time from start to completion (ms) */
  totalTimeMs: number;
}

/**
 * Create an empty node timing object
 */
export function createEmptyNodeTiming(): NodeTiming {
  return {
    waitTimeMs: 0,
    initTimeMs: 0,
    executeTimeMs: 0,
    handoffTimeMs: 0,
    totalTimeMs: 0,
  };
}

/**
 * Create a failed execution result
 */
export function createFailedResult(
  error: PipelineError,
  partialResults: Map<string, NodeExecutionResult>,
  timing: Map<string, NodeTiming>,
  completedNodes: string[],
  allNodes: string[]
): PipelineExecutionResult {
  const failedNodes = [error.info.nodeId];
  const skippedNodes = allNodes.filter(
    (n) => !completedNodes.includes(n) && !failedNodes.includes(n)
  );

  return {
    success: false,
    partialResults,
    error: error.info,
    errors: [error.info],
    timing,
    totalTimeMs: Array.from(timing.values()).reduce((sum, t) => sum + t.totalTimeMs, 0),
    completedNodes,
    failedNodes,
    skippedNodes,
  };
}

/**
 * Create a successful execution result
 */
export function createSuccessResult<T>(
  result: T,
  partialResults: Map<string, NodeExecutionResult>,
  timing: Map<string, NodeTiming>,
  allNodes: string[]
): PipelineExecutionResult<T> {
  return {
    success: true,
    result,
    partialResults,
    errors: [],
    timing,
    totalTimeMs: Array.from(timing.values()).reduce((sum, t) => sum + t.totalTimeMs, 0),
    completedNodes: allNodes,
    failedNodes: [],
    skippedNodes: [],
  };
}
