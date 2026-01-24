/**
 * Atomic Signal Manager - Zero-copy handoff between pipeline nodes
 *
 * This module implements atomic signaling for pipeline node coordination using
 * SharedArrayBuffer and Atomics. Nodes can signal completion and wait for
 * upstream dependencies without any data copying.
 *
 * ## State Machine
 *
 * Each node transitions through these states:
 * ```
 * IDLE -> WAITING -> RUNNING -> COMPLETE -> IDLE
 *           |          |
 *           |          v
 *           +----> ERROR
 * ```
 *
 * ## Memory Layout (in status region)
 *
 * Each node gets a 4-byte status word (Int32) at a dedicated offset:
 * ```
 * +------------------+
 * | Node 0 status    |  - 4 bytes (Int32) for Atomics compatibility
 * +------------------+
 * | Node 1 status    |
 * +------------------+
 * | ...              |
 * +------------------+
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * // Main thread creates the signal manager
 * const signals = new AtomicSignalManager(sab, statusOffset, nodeIds);
 *
 * // Worker attaches to signals
 * const workerSignals = AtomicSignalManager.attach(sab, statusOffset, nodeIds);
 *
 * // Wait for upstream node to complete
 * await workerSignals.waitFor('upstream-node', NodeState.COMPLETE, 5000);
 *
 * // Signal own completion
 * workerSignals.signal('my-node', NodeState.COMPLETE);
 * ```
 *
 * @module orchestrator/atomic-signals
 */

/**
 * Pipeline node execution states.
 *
 * These values are stored in SharedArrayBuffer and used with Atomics.
 */
export enum NodeState {
  /** Node is idle, not started */
  IDLE = 0,
  /** Node is waiting for upstream dependencies */
  WAITING = 1,
  /** Node is currently executing */
  RUNNING = 2,
  /** Node completed successfully */
  COMPLETE = 3,
  /** Node failed with an error */
  ERROR = 4,
}

/**
 * Human-readable state names for logging
 */
export const NODE_STATE_NAMES: Record<NodeState, string> = {
  [NodeState.IDLE]: 'IDLE',
  [NodeState.WAITING]: 'WAITING',
  [NodeState.RUNNING]: 'RUNNING',
  [NodeState.COMPLETE]: 'COMPLETE',
  [NodeState.ERROR]: 'ERROR',
};

/**
 * Result of a wait operation
 */
export interface WaitResult {
  /** Whether the wait completed successfully */
  success: boolean;
  /** The state that was observed */
  observedState: NodeState;
  /** Time spent waiting in nanoseconds */
  waitTimeNs: number;
  /** Whether the wait timed out */
  timedOut: boolean;
}

/**
 * Timing information for a signal transition
 */
export interface SignalTiming {
  /** Node that transitioned */
  nodeId: string;
  /** Previous state */
  fromState: NodeState;
  /** New state */
  toState: NodeState;
  /** High-resolution timestamp (nanoseconds since epoch or relative) */
  timestampNs: number;
  /** Wall clock time for correlation */
  wallTime: Date;
}

/**
 * Constants for atomic signal layout
 */
const BYTES_PER_NODE = 4; // Int32 for Atomics compatibility
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds default timeout

/**
 * Check if Atomics.wait is available.
 *
 * In main thread of browsers, Atomics.wait throws an error because it would
 * block the UI. Workers and Node.js can use it freely.
 *
 * @returns true if Atomics.wait can be used
 */
export function isAtomicsWaitAvailable(): boolean {
  if (typeof Atomics === 'undefined') {
    return false;
  }

  // In Node.js (main thread or worker_threads), Atomics.wait is available
  if (typeof process !== 'undefined' && process.versions?.node) {
    return true;
  }

  // In browser main thread, Atomics.wait will throw
  // We detect this by checking for window (main thread) vs self without window (worker)
  if (typeof window !== 'undefined') {
    // Main browser thread - Atomics.wait not available
    return false;
  }

  // Browser worker context - Atomics.wait is available
  return true;
}

/**
 * Check if Atomics.notify is available.
 *
 * @returns true if Atomics.notify can be used
 */
export function isAtomicsNotifyAvailable(): boolean {
  return typeof Atomics !== 'undefined' && typeof Atomics.notify === 'function';
}

/**
 * Get high-resolution timestamp in nanoseconds.
 *
 * Uses performance.now() when available (microsecond precision in most browsers,
 * nanosecond in Node.js), falls back to Date.now() (millisecond precision).
 *
 * @returns Timestamp in nanoseconds
 */
export function getHighResolutionTimestamp(): number {
  if (typeof performance !== 'undefined' && performance.now) {
    // performance.now() returns milliseconds with sub-millisecond precision
    // Multiply by 1e6 to get nanoseconds
    return Math.round(performance.now() * 1e6);
  }
  // Fall back to Date.now() (milliseconds)
  return Date.now() * 1e6;
}

/**
 * Format nanoseconds as human-readable string
 */
export function formatNanoseconds(ns: number): string {
  if (ns < 1000) return `${ns}ns`;
  if (ns < 1e6) return `${(ns / 1000).toFixed(2)}µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(2)}ms`;
  return `${(ns / 1e9).toFixed(3)}s`;
}

/**
 * AtomicSignalManager coordinates pipeline node execution using Atomics.
 *
 * This class provides:
 * - State transitions via Atomics.store
 * - Waiting for state changes via Atomics.wait (in workers)
 * - Notification of state changes via Atomics.notify
 * - High-resolution timing for performance analysis
 * - Fallback to polling for environments without Atomics.wait
 *
 * @example
 * ```typescript
 * // Create signal manager on main thread
 * const sab = memoryManager.getBuffer();
 * const statusOffset = memoryManager.getOffsetMap().status.offset;
 * const signals = new AtomicSignalManager(sab, statusOffset, ['esg', 'projection']);
 *
 * // Initialize all nodes to IDLE
 * signals.resetAll();
 *
 * // In worker, attach to existing signals
 * const workerSignals = AtomicSignalManager.attach(sab, statusOffset, ['esg', 'projection']);
 *
 * // Wait for esg to complete before running projection
 * const result = await workerSignals.waitFor('esg', NodeState.COMPLETE);
 * if (result.success) {
 *   workerSignals.signal('projection', NodeState.RUNNING);
 *   // ... run projection ...
 *   workerSignals.signal('projection', NodeState.COMPLETE);
 * }
 * ```
 */
export class AtomicSignalManager {
  private readonly _int32View: Int32Array;
  private readonly _nodeOffsets: Map<string, number>;
  private readonly _nodeIds: string[];
  private readonly _statusOffset: number;
  private _timings: SignalTiming[] = [];
  private _enableTimingLog = false;
  private _logger: ((message: string, ...args: unknown[]) => void) | null = null;

  /**
   * Create a new AtomicSignalManager.
   *
   * @param buffer - SharedArrayBuffer containing the status region
   * @param statusOffset - Byte offset to the status region within the buffer
   * @param nodeIds - Array of node IDs in execution order
   */
  constructor(
    buffer: SharedArrayBuffer,
    statusOffset: number,
    nodeIds: string[]
  ) {
    this._statusOffset = statusOffset;
    this._nodeIds = [...nodeIds];
    this._nodeOffsets = new Map();

    // Each node gets a 4-byte Int32 slot
    for (let i = 0; i < nodeIds.length; i++) {
      this._nodeOffsets.set(nodeIds[i], i);
    }

    // Create Int32Array view for atomic operations
    // The view starts at statusOffset and has one Int32 per node
    this._int32View = new Int32Array(
      buffer,
      statusOffset,
      nodeIds.length
    );
  }

  /**
   * Attach to an existing signal region in a SharedArrayBuffer.
   *
   * This is typically used by workers to attach to signals created on the main thread.
   *
   * @param buffer - SharedArrayBuffer containing the status region
   * @param statusOffset - Byte offset to the status region within the buffer
   * @param nodeIds - Array of node IDs (must match the original creation order)
   * @returns New AtomicSignalManager instance attached to the buffer
   */
  static attach(
    buffer: SharedArrayBuffer,
    statusOffset: number,
    nodeIds: string[]
  ): AtomicSignalManager {
    return new AtomicSignalManager(buffer, statusOffset, nodeIds);
  }

  /**
   * Calculate the byte size needed for the status region.
   *
   * @param nodeCount - Number of pipeline nodes
   * @returns Size in bytes (aligned to 16 bytes for SIMD)
   */
  static calculateSize(nodeCount: number): number {
    const rawSize = nodeCount * BYTES_PER_NODE;
    // Align to 16 bytes for SIMD compatibility
    return Math.ceil(rawSize / 16) * 16;
  }

  /**
   * Set a logger function for debug output.
   *
   * @param logger - Logger function or null to disable
   */
  setLogger(logger: ((message: string, ...args: unknown[]) => void) | null): void {
    this._logger = logger;
  }

  /**
   * Enable or disable timing logging.
   *
   * When enabled, all state transitions are recorded with nanosecond timestamps.
   *
   * @param enabled - Whether to enable timing logging
   */
  setTimingLogEnabled(enabled: boolean): void {
    this._enableTimingLog = enabled;
    if (!enabled) {
      this._timings = [];
    }
  }

  private log(message: string, ...args: unknown[]): void {
    if (this._logger) {
      this._logger(`[AtomicSignals] ${message}`, ...args);
    }
  }

  private recordTiming(nodeId: string, fromState: NodeState, toState: NodeState): void {
    if (!this._enableTimingLog) return;

    const timing: SignalTiming = {
      nodeId,
      fromState,
      toState,
      timestampNs: getHighResolutionTimestamp(),
      wallTime: new Date(),
    };

    this._timings.push(timing);

    this.log(
      `[${nodeId}] ${NODE_STATE_NAMES[fromState]} -> ${NODE_STATE_NAMES[toState]} @ ${formatNanoseconds(timing.timestampNs)}`
    );
  }

  /**
   * Get the index for a node ID.
   *
   * @throws Error if node ID is not found
   */
  private getNodeIndex(nodeId: string): number {
    const index = this._nodeOffsets.get(nodeId);
    if (index === undefined) {
      throw new Error(`Unknown node: ${nodeId}`);
    }
    return index;
  }

  /**
   * Get the current state of a node.
   *
   * @param nodeId - ID of the node
   * @returns Current state
   */
  getState(nodeId: string): NodeState {
    const index = this.getNodeIndex(nodeId);
    return Atomics.load(this._int32View, index) as NodeState;
  }

  /**
   * Get all node states as a map.
   *
   * @returns Map of node ID to current state
   */
  getAllStates(): Map<string, NodeState> {
    const states = new Map<string, NodeState>();
    for (const nodeId of this._nodeIds) {
      states.set(nodeId, this.getState(nodeId));
    }
    return states;
  }

  /**
   * Signal a state transition for a node.
   *
   * Uses Atomics.store for thread-safe update and Atomics.notify to wake
   * any waiters.
   *
   * @param nodeId - ID of the node
   * @param newState - New state to transition to
   * @returns Previous state
   */
  signal(nodeId: string, newState: NodeState): NodeState {
    const index = this.getNodeIndex(nodeId);
    const oldState = Atomics.exchange(this._int32View, index, newState) as NodeState;

    this.recordTiming(nodeId, oldState, newState);

    // Notify any waiters (in workers)
    if (isAtomicsNotifyAvailable()) {
      Atomics.notify(this._int32View, index, Infinity);
    }

    return oldState;
  }

  /**
   * Wait for a node to reach a specific state.
   *
   * In workers, uses Atomics.wait for efficient blocking.
   * In main thread or without Atomics support, uses polling fallback.
   *
   * @param nodeId - ID of the node to wait for
   * @param expectedState - State to wait for
   * @param timeoutMs - Maximum wait time in milliseconds (default: 30000)
   * @returns Wait result with timing information
   */
  async waitFor(
    nodeId: string,
    expectedState: NodeState,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<WaitResult> {
    const index = this.getNodeIndex(nodeId);
    const startNs = getHighResolutionTimestamp();

    // First check if already in the expected state
    let currentState = Atomics.load(this._int32View, index) as NodeState;
    if (currentState === expectedState) {
      return {
        success: true,
        observedState: currentState,
        waitTimeNs: 0,
        timedOut: false,
      };
    }

    // Also accept ERROR state as a terminal condition
    if (currentState === NodeState.ERROR) {
      return {
        success: false,
        observedState: currentState,
        waitTimeNs: getHighResolutionTimestamp() - startNs,
        timedOut: false,
      };
    }

    // Use Atomics.wait if available (in workers)
    if (isAtomicsWaitAvailable()) {
      return this.waitWithAtomics(index, expectedState, timeoutMs, startNs);
    }

    // Fallback to polling (main thread or without Atomics support)
    return this.waitWithPolling(index, expectedState, timeoutMs, startNs);
  }

  /**
   * Wait using Atomics.wait (efficient, blocking)
   */
  private waitWithAtomics(
    index: number,
    expectedState: NodeState,
    timeoutMs: number,
    startNs: number
  ): WaitResult {
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const currentState = Atomics.load(this._int32View, index) as NodeState;

      if (currentState === expectedState) {
        return {
          success: true,
          observedState: currentState,
          waitTimeNs: getHighResolutionTimestamp() - startNs,
          timedOut: false,
        };
      }

      if (currentState === NodeState.ERROR) {
        return {
          success: false,
          observedState: currentState,
          waitTimeNs: getHighResolutionTimestamp() - startNs,
          timedOut: false,
        };
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return {
          success: false,
          observedState: currentState,
          waitTimeNs: getHighResolutionTimestamp() - startNs,
          timedOut: true,
        };
      }

      // Wait for the value to change (or timeout)
      // We wait on the current value - if it changes, we'll wake up
      const waitResult = Atomics.wait(
        this._int32View,
        index,
        currentState,
        remainingMs
      );

      // 'ok' means value changed, 'timed-out' means timeout, 'not-equal' means already changed
      if (waitResult === 'timed-out') {
        const finalState = Atomics.load(this._int32View, index) as NodeState;
        return {
          success: finalState === expectedState,
          observedState: finalState,
          waitTimeNs: getHighResolutionTimestamp() - startNs,
          timedOut: finalState !== expectedState,
        };
      }
    }
  }

  /**
   * Wait using polling (fallback for main thread)
   */
  private async waitWithPolling(
    index: number,
    expectedState: NodeState,
    timeoutMs: number,
    startNs: number
  ): Promise<WaitResult> {
    const deadline = Date.now() + timeoutMs;
    const pollInterval = 1; // 1ms polling interval

    while (true) {
      const currentState = Atomics.load(this._int32View, index) as NodeState;

      if (currentState === expectedState) {
        return {
          success: true,
          observedState: currentState,
          waitTimeNs: getHighResolutionTimestamp() - startNs,
          timedOut: false,
        };
      }

      if (currentState === NodeState.ERROR) {
        return {
          success: false,
          observedState: currentState,
          waitTimeNs: getHighResolutionTimestamp() - startNs,
          timedOut: false,
        };
      }

      if (Date.now() >= deadline) {
        return {
          success: false,
          observedState: currentState,
          waitTimeNs: getHighResolutionTimestamp() - startNs,
          timedOut: true,
        };
      }

      // Sleep for poll interval
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * Wait for multiple nodes to reach a specific state.
   *
   * @param nodeIds - IDs of nodes to wait for
   * @param expectedState - State to wait for
   * @param timeoutMs - Maximum wait time in milliseconds
   * @returns Map of node ID to wait result
   */
  async waitForAll(
    nodeIds: string[],
    expectedState: NodeState,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<Map<string, WaitResult>> {
    const results = new Map<string, WaitResult>();
    const startTime = Date.now();

    for (const nodeId of nodeIds) {
      const remainingMs = Math.max(0, timeoutMs - (Date.now() - startTime));
      const result = await this.waitFor(nodeId, expectedState, remainingMs);
      results.set(nodeId, result);

      // If any node failed or timed out, we might want to continue or abort
      // For now, we continue to collect all results
    }

    return results;
  }

  /**
   * Reset a node to IDLE state.
   *
   * @param nodeId - ID of the node to reset
   */
  reset(nodeId: string): void {
    this.signal(nodeId, NodeState.IDLE);
  }

  /**
   * Reset all nodes to IDLE state.
   */
  resetAll(): void {
    for (const nodeId of this._nodeIds) {
      this.reset(nodeId);
    }
  }

  /**
   * Get timing logs for all state transitions.
   *
   * Only populated when timing logging is enabled via setTimingLogEnabled(true).
   *
   * @returns Array of timing records
   */
  getTimingLog(): readonly SignalTiming[] {
    return [...this._timings];
  }

  /**
   * Clear timing logs.
   */
  clearTimingLog(): void {
    this._timings = [];
  }

  /**
   * Calculate handoff latency between two nodes.
   *
   * Finds the time between node A completing and node B starting to run.
   *
   * @param fromNodeId - ID of the upstream node
   * @param toNodeId - ID of the downstream node
   * @returns Latency in nanoseconds, or null if transitions not found
   */
  calculateHandoffLatency(fromNodeId: string, toNodeId: string): number | null {
    if (!this._enableTimingLog || this._timings.length === 0) {
      return null;
    }

    // Find when fromNode completed
    const fromComplete = this._timings.find(
      (t) => t.nodeId === fromNodeId && t.toState === NodeState.COMPLETE
    );

    // Find when toNode started running
    const toRunning = this._timings.find(
      (t) => t.nodeId === toNodeId && t.toState === NodeState.RUNNING
    );

    if (!fromComplete || !toRunning) {
      return null;
    }

    return toRunning.timestampNs - fromComplete.timestampNs;
  }

  /**
   * Get summary of all handoff latencies.
   *
   * @returns Array of handoff latencies between consecutive nodes
   */
  getAllHandoffLatencies(): Array<{ from: string; to: string; latencyNs: number }> {
    const latencies: Array<{ from: string; to: string; latencyNs: number }> = [];

    for (let i = 0; i < this._nodeIds.length - 1; i++) {
      const fromNode = this._nodeIds[i];
      const toNode = this._nodeIds[i + 1];
      const latency = this.calculateHandoffLatency(fromNode, toNode);

      if (latency !== null) {
        latencies.push({ from: fromNode, to: toNode, latencyNs: latency });
      }
    }

    return latencies;
  }

  /**
   * Get all registered node IDs.
   */
  get nodeIds(): readonly string[] {
    return this._nodeIds;
  }

  /**
   * Get the number of registered nodes.
   */
  get nodeCount(): number {
    return this._nodeIds.length;
  }
}

/**
 * Message-based handoff for environments without SharedArrayBuffer.
 *
 * This provides a fallback implementation using postMessage when
 * SharedArrayBuffer/Atomics are not available.
 */
export interface MessageHandoffConfig {
  /** Callback when a node completes */
  onNodeComplete: (nodeId: string) => void;
  /** Callback when a node errors */
  onNodeError: (nodeId: string, error: Error) => void;
}

/**
 * MessageBasedSignalManager provides node coordination without SharedArrayBuffer.
 *
 * This fallback uses event-based signaling when Atomics are unavailable.
 * It's less efficient but works in all environments.
 */
export class MessageBasedSignalManager {
  private readonly _nodeStates: Map<string, NodeState> = new Map();
  private readonly _nodeIds: string[];
  private readonly _waiters: Map<string, Array<{
    expectedState: NodeState;
    resolve: (result: WaitResult) => void;
    timeout: NodeJS.Timeout | number;
  }>> = new Map();
  private _logger: ((message: string, ...args: unknown[]) => void) | null = null;

  /**
   * Create a new MessageBasedSignalManager.
   *
   * @param nodeIds - Array of node IDs in execution order
   */
  constructor(nodeIds: string[]) {
    this._nodeIds = [...nodeIds];
    for (const nodeId of nodeIds) {
      this._nodeStates.set(nodeId, NodeState.IDLE);
    }
  }

  /**
   * Set a logger function for debug output.
   */
  setLogger(logger: ((message: string, ...args: unknown[]) => void) | null): void {
    this._logger = logger;
  }

  private log(message: string, ...args: unknown[]): void {
    if (this._logger) {
      this._logger(`[MessageSignals] ${message}`, ...args);
    }
  }

  /**
   * Get the current state of a node.
   */
  getState(nodeId: string): NodeState {
    const state = this._nodeStates.get(nodeId);
    if (state === undefined) {
      throw new Error(`Unknown node: ${nodeId}`);
    }
    return state;
  }

  /**
   * Signal a state transition for a node.
   */
  signal(nodeId: string, newState: NodeState): NodeState {
    const oldState = this._nodeStates.get(nodeId);
    if (oldState === undefined) {
      throw new Error(`Unknown node: ${nodeId}`);
    }

    this._nodeStates.set(nodeId, newState);
    this.log(`[${nodeId}] ${NODE_STATE_NAMES[oldState]} -> ${NODE_STATE_NAMES[newState]}`);

    // Resolve any waiters for this node
    const waiters = this._waiters.get(nodeId);
    if (waiters) {
      const matchingWaiters = waiters.filter(
        (w) => w.expectedState === newState || (newState === NodeState.ERROR)
      );

      for (const waiter of matchingWaiters) {
        clearTimeout(waiter.timeout);
        waiter.resolve({
          success: newState === waiter.expectedState,
          observedState: newState,
          waitTimeNs: 0, // Not tracked in message-based mode
          timedOut: false,
        });
      }

      // Remove resolved waiters
      this._waiters.set(
        nodeId,
        waiters.filter((w) => !matchingWaiters.includes(w))
      );
    }

    return oldState;
  }

  /**
   * Wait for a node to reach a specific state.
   */
  async waitFor(
    nodeId: string,
    expectedState: NodeState,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<WaitResult> {
    const startNs = getHighResolutionTimestamp();

    // Check current state
    const currentState = this.getState(nodeId);
    if (currentState === expectedState) {
      return {
        success: true,
        observedState: currentState,
        waitTimeNs: 0,
        timedOut: false,
      };
    }

    if (currentState === NodeState.ERROR) {
      return {
        success: false,
        observedState: currentState,
        waitTimeNs: getHighResolutionTimestamp() - startNs,
        timedOut: false,
      };
    }

    // Wait for state change
    return new Promise<WaitResult>((resolve) => {
      const timeout = setTimeout(() => {
        const finalState = this.getState(nodeId);
        resolve({
          success: false,
          observedState: finalState,
          waitTimeNs: getHighResolutionTimestamp() - startNs,
          timedOut: true,
        });
      }, timeoutMs);

      // Add to waiters
      if (!this._waiters.has(nodeId)) {
        this._waiters.set(nodeId, []);
      }
      this._waiters.get(nodeId)!.push({
        expectedState,
        resolve,
        timeout,
      });
    });
  }

  /**
   * Reset all nodes to IDLE state.
   */
  resetAll(): void {
    for (const nodeId of this._nodeIds) {
      this._nodeStates.set(nodeId, NodeState.IDLE);
    }
  }

  /**
   * Get all registered node IDs.
   */
  get nodeIds(): readonly string[] {
    return this._nodeIds;
  }
}

/**
 * Create the appropriate signal manager based on environment capabilities.
 *
 * @param buffer - SharedArrayBuffer (or null for message-based fallback)
 * @param statusOffset - Byte offset to status region (ignored for message-based)
 * @param nodeIds - Array of node IDs
 * @returns AtomicSignalManager if SAB available, MessageBasedSignalManager otherwise
 */
export function createSignalManager(
  buffer: SharedArrayBuffer | null,
  statusOffset: number,
  nodeIds: string[]
): AtomicSignalManager | MessageBasedSignalManager {
  if (buffer && isAtomicsNotifyAvailable()) {
    return new AtomicSignalManager(buffer, statusOffset, nodeIds);
  }
  return new MessageBasedSignalManager(nodeIds);
}

/**
 * Check if a signal manager is atomic-based (vs message-based).
 */
export function isAtomicSignalManager(
  manager: AtomicSignalManager | MessageBasedSignalManager
): manager is AtomicSignalManager {
  return manager instanceof AtomicSignalManager;
}
