/**
 * Work-Stealing Deque - Lock-free double-ended queue for work distribution
 *
 * This implements a Chase-Lev work-stealing deque using SharedArrayBuffer and Atomics.
 * Each worker has its own deque and can:
 * - Push tasks to the bottom (local operation)
 * - Pop tasks from the bottom (local operation, LIFO for cache locality)
 * - Other workers can steal tasks from the top (FIFO for fairness)
 *
 * The implementation uses Atomics for lock-free synchronization:
 * - bottom: incremented on push, decremented on pop (local only)
 * - top: incremented on steal (contended between stealers)
 *
 * Memory Layout per Deque:
 * ```
 * +------------------+
 * | bottom (4 bytes) |  - Index where owner pushes/pops
 * +------------------+
 * | top (4 bytes)    |  - Index where thieves steal
 * +------------------+
 * | tasks[0..N-1]    |  - Task IDs (4 bytes each)
 * +------------------+
 * ```
 *
 * @module work-stealing-deque
 */

/**
 * Result of a deque operation
 */
export enum DequeResult {
  /** Operation succeeded */
  SUCCESS = 0,
  /** Deque is empty */
  EMPTY = 1,
  /** Deque is full */
  FULL = 2,
  /** Operation was aborted due to contention */
  ABORT = 3,
}

/**
 * Constants for deque layout
 */
const BOTTOM_OFFSET = 0;      // Offset of bottom index (Int32)
const TOP_OFFSET = 4;         // Offset of top index (Int32)
const TASKS_OFFSET = 8;       // Offset of task array (Int32[])
const BYTES_PER_TASK = 4;     // Each task ID is 4 bytes (Int32)

/**
 * Default deque capacity (number of tasks)
 */
const DEFAULT_CAPACITY = 1024;

/**
 * WorkStealingDeque provides a lock-free work-stealing deque.
 *
 * The owner thread (one worker) can push and pop tasks from the bottom.
 * Other threads can steal tasks from the top.
 *
 * @example
 * ```typescript
 * // Create shared buffer
 * const buffer = new SharedArrayBuffer(WorkStealingDeque.calculateSize(1024));
 *
 * // Initialize deque (typically done once by main thread)
 * const ownerDeque = new WorkStealingDeque(buffer, 0, 1024, true);
 *
 * // Push tasks (owner only)
 * ownerDeque.push(taskId1);
 * ownerDeque.push(taskId2);
 *
 * // Pop tasks (owner only - LIFO)
 * const task = ownerDeque.pop();
 *
 * // Steal tasks (thieves - FIFO)
 * const thiefDeque = new WorkStealingDeque(buffer, 0, 1024, false);
 * const stolen = thiefDeque.steal();
 * ```
 */
export class WorkStealingDeque {
  private readonly int32View: Int32Array;
  private readonly capacity: number;
  private readonly baseOffset: number;
  private readonly isOwner: boolean;

  /**
   * Calculate the byte size needed for a deque with given capacity.
   *
   * @param capacity - Maximum number of tasks the deque can hold
   * @returns Size in bytes
   */
  static calculateSize(capacity: number = DEFAULT_CAPACITY): number {
    return TASKS_OFFSET + capacity * BYTES_PER_TASK;
  }

  /**
   * Create a new WorkStealingDeque view.
   *
   * @param buffer - SharedArrayBuffer containing the deque data
   * @param byteOffset - Byte offset into the buffer where this deque starts
   * @param capacity - Maximum number of tasks (must match what was allocated)
   * @param isOwner - Whether this is the owner (can push/pop) or thief (can steal)
   */
  constructor(
    buffer: SharedArrayBuffer,
    byteOffset: number,
    capacity: number = DEFAULT_CAPACITY,
    isOwner: boolean = true
  ) {
    // Store the Int32 index offset (relative to the Int32 view)
    // byteOffset must be 4-byte aligned
    if (byteOffset % 4 !== 0) {
      throw new Error('byteOffset must be 4-byte aligned');
    }
    this.baseOffset = byteOffset / 4; // Convert to Int32 index
    this.capacity = capacity;
    this.isOwner = isOwner;

    // Create Int32 view for atomic operations over the entire buffer
    this.int32View = new Int32Array(buffer);
  }

  /**
   * Initialize the deque (must be called before use, typically by main thread).
   */
  initialize(): void {
    // Set bottom and top to 0
    Atomics.store(this.int32View, this.bottomIndex(), 0);
    Atomics.store(this.int32View, this.topIndex(), 0);
  }

  /**
   * Push a task to the bottom of the deque (owner only, LIFO).
   *
   * @param taskId - Task identifier to push
   * @returns SUCCESS if pushed, FULL if deque is at capacity
   */
  push(taskId: number): DequeResult {
    if (!this.isOwner) {
      throw new Error('Only owner can push to deque');
    }

    const bottom = Atomics.load(this.int32View, this.bottomIndex());
    const top = Atomics.load(this.int32View, this.topIndex());
    const size = bottom - top;

    if (size >= this.capacity) {
      return DequeResult.FULL;
    }

    // Write task at bottom index (no contention, only owner writes)
    const taskIndex = this.taskIndex(bottom % this.capacity);
    Atomics.store(this.int32View, taskIndex, taskId);

    // Memory fence to ensure task is visible before incrementing bottom
    // In JS, Atomics.store provides this guarantee

    // Increment bottom
    Atomics.store(this.int32View, this.bottomIndex(), bottom + 1);

    return DequeResult.SUCCESS;
  }

  /**
   * Pop a task from the bottom of the deque (owner only, LIFO).
   *
   * @returns The task ID and result code, or EMPTY if no tasks available
   */
  pop(): { taskId: number; result: DequeResult } {
    if (!this.isOwner) {
      throw new Error('Only owner can pop from deque');
    }

    let bottom = Atomics.load(this.int32View, this.bottomIndex());

    // Decrement bottom first
    bottom = bottom - 1;
    Atomics.store(this.int32View, this.bottomIndex(), bottom);

    // Memory fence (implicit in Atomics operations)

    const top = Atomics.load(this.int32View, this.topIndex());
    const size = bottom - top;

    if (size < 0) {
      // Deque was already empty, restore bottom
      Atomics.store(this.int32View, this.bottomIndex(), top);
      return { taskId: 0, result: DequeResult.EMPTY };
    }

    // Read the task
    const taskIndex = this.taskIndex(bottom % this.capacity);
    const taskId = Atomics.load(this.int32View, taskIndex);

    if (size > 0) {
      // No contention, we successfully popped
      return { taskId, result: DequeResult.SUCCESS };
    }

    // size === 0: Only one element, might race with stealers
    // Use CAS on top to claim it
    const casResult = Atomics.compareExchange(
      this.int32View,
      this.topIndex(),
      top,
      top + 1
    );

    // Restore bottom regardless of CAS result
    Atomics.store(this.int32View, this.bottomIndex(), top + 1);

    if (casResult === top) {
      // We won the race
      return { taskId, result: DequeResult.SUCCESS };
    }

    // A thief stole the last element
    return { taskId: 0, result: DequeResult.EMPTY };
  }

  /**
   * Steal a task from the top of the deque (thief operation, FIFO).
   *
   * Can be called by any thread. Returns ABORT if contention is detected,
   * in which case the caller should try a different victim.
   *
   * @returns The task ID and result code
   */
  steal(): { taskId: number; result: DequeResult } {
    const top = Atomics.load(this.int32View, this.topIndex());

    // Memory fence (implicit in Atomics operations)

    const bottom = Atomics.load(this.int32View, this.bottomIndex());
    const size = bottom - top;

    if (size <= 0) {
      return { taskId: 0, result: DequeResult.EMPTY };
    }

    // Read the task at top
    const taskIndex = this.taskIndex(top % this.capacity);
    const taskId = Atomics.load(this.int32View, taskIndex);

    // Try to claim it with CAS
    const casResult = Atomics.compareExchange(
      this.int32View,
      this.topIndex(),
      top,
      top + 1
    );

    if (casResult !== top) {
      // Another thief or owner got it first
      return { taskId: 0, result: DequeResult.ABORT };
    }

    return { taskId, result: DequeResult.SUCCESS };
  }

  /**
   * Get the current size of the deque (approximate, may change).
   */
  size(): number {
    const bottom = Atomics.load(this.int32View, this.bottomIndex());
    const top = Atomics.load(this.int32View, this.topIndex());
    return Math.max(0, bottom - top);
  }

  /**
   * Check if the deque is empty (approximate, may change).
   */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private bottomIndex(): number {
    return this.baseOffset + BOTTOM_OFFSET / 4;
  }

  private topIndex(): number {
    return this.baseOffset + TOP_OFFSET / 4;
  }

  private taskIndex(index: number): number {
    return this.baseOffset + TASKS_OFFSET / 4 + index;
  }
}

/**
 * WorkStealingDequePool manages multiple deques in a single SharedArrayBuffer.
 *
 * Memory Layout:
 * ```
 * +---------------------------+
 * | Header (16 bytes)         |  - Metadata
 * +---------------------------+
 * | Deque 0                   |  - First worker's deque
 * +---------------------------+
 * | Deque 1                   |  - Second worker's deque
 * +---------------------------+
 * | ...                       |
 * +---------------------------+
 * | Deque N-1                 |  - Last worker's deque
 * +---------------------------+
 * ```
 */
export class WorkStealingDequePool {
  private readonly buffer: SharedArrayBuffer;
  private readonly workerCount: number;
  private readonly dequeCapacity: number;
  private readonly dequeSize: number;
  private readonly headerSize = 16;
  private readonly int32View: Int32Array;

  // Header offsets
  private static readonly HEADER_MAGIC = 0x57534450; // 'WSDP'
  private static readonly OFFSET_MAGIC = 0;
  private static readonly OFFSET_WORKER_COUNT = 4;
  private static readonly OFFSET_DEQUE_CAPACITY = 8;
  private static readonly OFFSET_ACTIVE_WORKERS = 12;

  /**
   * Calculate the total buffer size needed.
   *
   * @param workerCount - Number of workers
   * @param dequeCapacity - Capacity per deque
   * @returns Total size in bytes
   */
  static calculateSize(workerCount: number, dequeCapacity: number = DEFAULT_CAPACITY): number {
    const dequeSize = WorkStealingDeque.calculateSize(dequeCapacity);
    return 16 + workerCount * dequeSize;
  }

  /**
   * Create a new deque pool.
   *
   * @param workerCount - Number of workers
   * @param dequeCapacity - Capacity per deque
   */
  constructor(workerCount: number, dequeCapacity: number = DEFAULT_CAPACITY) {
    this.workerCount = workerCount;
    this.dequeCapacity = dequeCapacity;
    this.dequeSize = WorkStealingDeque.calculateSize(dequeCapacity);

    // Allocate buffer
    const totalSize = WorkStealingDequePool.calculateSize(workerCount, dequeCapacity);
    this.buffer = new SharedArrayBuffer(totalSize);
    this.int32View = new Int32Array(this.buffer);

    // Initialize header
    this.int32View[WorkStealingDequePool.OFFSET_MAGIC / 4] = WorkStealingDequePool.HEADER_MAGIC;
    this.int32View[WorkStealingDequePool.OFFSET_WORKER_COUNT / 4] = workerCount;
    this.int32View[WorkStealingDequePool.OFFSET_DEQUE_CAPACITY / 4] = dequeCapacity;
    this.int32View[WorkStealingDequePool.OFFSET_ACTIVE_WORKERS / 4] = workerCount;

    // Initialize all deques
    for (let i = 0; i < workerCount; i++) {
      const offset = this.getDequeOffset(i);
      const deque = new WorkStealingDeque(this.buffer, offset, dequeCapacity, true);
      deque.initialize();
    }
  }

  /**
   * Get the SharedArrayBuffer.
   */
  getBuffer(): SharedArrayBuffer {
    return this.buffer;
  }

  /**
   * Get deque offset for a worker.
   */
  getDequeOffset(workerId: number): number {
    return this.headerSize + workerId * this.dequeSize;
  }

  /**
   * Create a deque view for a worker.
   *
   * @param workerId - Worker index (0-based)
   * @param isOwner - Whether this worker owns the deque
   * @returns WorkStealingDeque view
   */
  getDeque(workerId: number, isOwner: boolean): WorkStealingDeque {
    if (workerId < 0 || workerId >= this.workerCount) {
      throw new Error(`Invalid worker ID: ${workerId}`);
    }
    const offset = this.getDequeOffset(workerId);
    return new WorkStealingDeque(this.buffer, offset, this.dequeCapacity, isOwner);
  }

  /**
   * Get the number of workers.
   */
  getWorkerCount(): number {
    return this.workerCount;
  }

  /**
   * Get the deque capacity.
   */
  getDequeCapacity(): number {
    return this.dequeCapacity;
  }

  /**
   * Decrement active worker count (called when a worker finishes).
   *
   * @returns The new active worker count
   */
  decrementActiveWorkers(): number {
    return Atomics.sub(this.int32View, WorkStealingDequePool.OFFSET_ACTIVE_WORKERS / 4, 1) - 1;
  }

  /**
   * Get active worker count.
   */
  getActiveWorkers(): number {
    return Atomics.load(this.int32View, WorkStealingDequePool.OFFSET_ACTIVE_WORKERS / 4);
  }

  /**
   * Reset active worker count (for reuse).
   */
  resetActiveWorkers(): void {
    Atomics.store(this.int32View, WorkStealingDequePool.OFFSET_ACTIVE_WORKERS / 4, this.workerCount);
  }
}

/**
 * Create a WorkStealingDequePool from an existing SharedArrayBuffer.
 * Used by workers to attach to the pool created by the main thread.
 *
 * @param buffer - SharedArrayBuffer containing the pool
 * @returns Configuration for the pool
 */
export function attachToDequePool(buffer: SharedArrayBuffer): {
  workerCount: number;
  dequeCapacity: number;
  headerSize: number;
} {
  const int32View = new Int32Array(buffer);
  const magic = int32View[0];
  if (magic !== 0x57534450) {
    throw new Error('Invalid deque pool buffer: magic number mismatch');
  }

  return {
    workerCount: int32View[1],
    dequeCapacity: int32View[2],
    headerSize: 16,
  };
}
