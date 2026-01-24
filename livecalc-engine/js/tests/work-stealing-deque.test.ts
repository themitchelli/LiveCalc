/**
 * Tests for WorkStealingDeque
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorkStealingDeque,
  WorkStealingDequePool,
  DequeResult,
  attachToDequePool,
} from '../src/work-stealing-deque.js';

describe('WorkStealingDeque', () => {
  const DEFAULT_CAPACITY = 128;
  let buffer: SharedArrayBuffer;
  let ownerDeque: WorkStealingDeque;
  let thiefDeque: WorkStealingDeque;

  beforeEach(() => {
    buffer = new SharedArrayBuffer(WorkStealingDeque.calculateSize(DEFAULT_CAPACITY));
    ownerDeque = new WorkStealingDeque(buffer, 0, DEFAULT_CAPACITY, true);
    thiefDeque = new WorkStealingDeque(buffer, 0, DEFAULT_CAPACITY, false);
    ownerDeque.initialize();
  });

  describe('initialization', () => {
    it('should start empty', () => {
      expect(ownerDeque.size()).toBe(0);
      expect(ownerDeque.isEmpty()).toBe(true);
    });

    it('should calculate correct buffer size', () => {
      const size = WorkStealingDeque.calculateSize(100);
      // Header (8 bytes) + tasks (100 * 4 bytes) = 408 bytes
      expect(size).toBe(8 + 100 * 4);
    });
  });

  describe('push and pop (owner operations)', () => {
    it('should push and pop a single task (LIFO)', () => {
      expect(ownerDeque.push(42)).toBe(DequeResult.SUCCESS);
      expect(ownerDeque.size()).toBe(1);

      const result = ownerDeque.pop();
      expect(result.result).toBe(DequeResult.SUCCESS);
      expect(result.taskId).toBe(42);
      expect(ownerDeque.isEmpty()).toBe(true);
    });

    it('should push and pop multiple tasks in LIFO order', () => {
      ownerDeque.push(1);
      ownerDeque.push(2);
      ownerDeque.push(3);

      expect(ownerDeque.pop().taskId).toBe(3);
      expect(ownerDeque.pop().taskId).toBe(2);
      expect(ownerDeque.pop().taskId).toBe(1);
      expect(ownerDeque.pop().result).toBe(DequeResult.EMPTY);
    });

    it('should return EMPTY when popping from empty deque', () => {
      const result = ownerDeque.pop();
      expect(result.result).toBe(DequeResult.EMPTY);
    });

    it('should return FULL when capacity exceeded', () => {
      // Fill to capacity
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        expect(ownerDeque.push(i)).toBe(DequeResult.SUCCESS);
      }
      expect(ownerDeque.push(999)).toBe(DequeResult.FULL);
    });

    it('should throw if non-owner tries to push', () => {
      expect(() => thiefDeque.push(42)).toThrow('Only owner can push');
    });

    it('should throw if non-owner tries to pop', () => {
      ownerDeque.push(42);
      expect(() => thiefDeque.pop()).toThrow('Only owner can pop');
    });
  });

  describe('steal (thief operations)', () => {
    it('should steal from the top (FIFO)', () => {
      ownerDeque.push(1);
      ownerDeque.push(2);
      ownerDeque.push(3);

      // Thief steals oldest (first pushed)
      const result = thiefDeque.steal();
      expect(result.result).toBe(DequeResult.SUCCESS);
      expect(result.taskId).toBe(1);

      // Owner pops newest (last pushed)
      expect(ownerDeque.pop().taskId).toBe(3);
    });

    it('should return EMPTY when stealing from empty deque', () => {
      const result = thiefDeque.steal();
      expect(result.result).toBe(DequeResult.EMPTY);
    });

    it('should handle concurrent owner pop and thief steal on single item', () => {
      // This tests the race condition when there's only one item
      ownerDeque.push(100);

      // Either owner or thief should get it, but not both
      const stealResult = thiefDeque.steal();
      const popResult = ownerDeque.pop();

      const stealSuccess = stealResult.result === DequeResult.SUCCESS;
      const popSuccess = popResult.result === DequeResult.SUCCESS;

      // Exactly one should succeed
      // Note: In actual concurrent execution, this would be non-deterministic
      // In single-threaded test, steal happens first
      expect(stealSuccess).toBe(true);
      expect(stealResult.taskId).toBe(100);
    });
  });

  describe('wraparound', () => {
    it('should handle index wraparound correctly', () => {
      // Small capacity to force wraparound
      const smallBuffer = new SharedArrayBuffer(WorkStealingDeque.calculateSize(4));
      const deque = new WorkStealingDeque(smallBuffer, 0, 4, true);
      deque.initialize();

      // Fill and empty multiple times to trigger wraparound
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 4; i++) {
          expect(deque.push(round * 10 + i)).toBe(DequeResult.SUCCESS);
        }
        for (let i = 0; i < 4; i++) {
          const result = deque.pop();
          expect(result.result).toBe(DequeResult.SUCCESS);
        }
      }

      // Should still work after wraparound
      deque.push(999);
      expect(deque.pop().taskId).toBe(999);
    });
  });
});

describe('WorkStealingDequePool', () => {
  const WORKER_COUNT = 4;
  const DEQUE_CAPACITY = 64;
  let pool: WorkStealingDequePool;

  beforeEach(() => {
    pool = new WorkStealingDequePool(WORKER_COUNT, DEQUE_CAPACITY);
  });

  describe('initialization', () => {
    it('should create pool with correct configuration', () => {
      expect(pool.getWorkerCount()).toBe(WORKER_COUNT);
      expect(pool.getDequeCapacity()).toBe(DEQUE_CAPACITY);
      expect(pool.getActiveWorkers()).toBe(WORKER_COUNT);
    });

    it('should calculate correct buffer size', () => {
      const dequeSize = WorkStealingDeque.calculateSize(DEQUE_CAPACITY);
      const expectedSize = 16 + WORKER_COUNT * dequeSize;
      expect(WorkStealingDequePool.calculateSize(WORKER_COUNT, DEQUE_CAPACITY)).toBe(expectedSize);
    });
  });

  describe('deque access', () => {
    it('should provide owner deques for each worker', () => {
      for (let i = 0; i < WORKER_COUNT; i++) {
        const deque = pool.getDeque(i, true);
        expect(deque.isEmpty()).toBe(true);
        expect(deque.push(i * 100)).toBe(DequeResult.SUCCESS);
        expect(deque.pop().taskId).toBe(i * 100);
      }
    });

    it('should provide thief deques for stealing', () => {
      const owner0 = pool.getDeque(0, true);
      const thief1 = pool.getDeque(0, false);

      owner0.push(42);

      const stolen = thief1.steal();
      expect(stolen.result).toBe(DequeResult.SUCCESS);
      expect(stolen.taskId).toBe(42);
    });

    it('should throw for invalid worker ID', () => {
      expect(() => pool.getDeque(-1, true)).toThrow('Invalid worker ID');
      expect(() => pool.getDeque(WORKER_COUNT, true)).toThrow('Invalid worker ID');
    });
  });

  describe('active worker tracking', () => {
    it('should track active workers', () => {
      expect(pool.getActiveWorkers()).toBe(WORKER_COUNT);

      pool.decrementActiveWorkers();
      expect(pool.getActiveWorkers()).toBe(WORKER_COUNT - 1);

      pool.decrementActiveWorkers();
      expect(pool.getActiveWorkers()).toBe(WORKER_COUNT - 2);
    });

    it('should reset active workers', () => {
      pool.decrementActiveWorkers();
      pool.decrementActiveWorkers();

      pool.resetActiveWorkers();
      expect(pool.getActiveWorkers()).toBe(WORKER_COUNT);
    });
  });

  describe('attachToDequePool', () => {
    it('should attach to existing pool buffer', () => {
      const buffer = pool.getBuffer();
      const config = attachToDequePool(buffer);

      expect(config.workerCount).toBe(WORKER_COUNT);
      expect(config.dequeCapacity).toBe(DEQUE_CAPACITY);
      expect(config.headerSize).toBe(16);
    });

    it('should throw for invalid buffer', () => {
      const invalidBuffer = new SharedArrayBuffer(32);
      new Int32Array(invalidBuffer)[0] = 0x12345678; // Wrong magic

      expect(() => attachToDequePool(invalidBuffer)).toThrow('magic number mismatch');
    });
  });
});

describe('WorkStealingDeque stress test', () => {
  it('should handle high-volume push and steal', () => {
    const capacity = 1024;
    const buffer = new SharedArrayBuffer(WorkStealingDeque.calculateSize(capacity));
    const owner = new WorkStealingDeque(buffer, 0, capacity, true);
    const thief = new WorkStealingDeque(buffer, 0, capacity, false);
    owner.initialize();

    // Push many tasks
    const taskCount = 500;
    for (let i = 0; i < taskCount; i++) {
      expect(owner.push(i)).toBe(DequeResult.SUCCESS);
    }

    // Interleave pop and steal
    const collectedByOwner: number[] = [];
    const collectedByThief: number[] = [];

    while (owner.size() > 0) {
      // Owner pops (from bottom, LIFO)
      const pop = owner.pop();
      if (pop.result === DequeResult.SUCCESS) {
        collectedByOwner.push(pop.taskId);
      }

      // Thief steals (from top, FIFO)
      const steal = thief.steal();
      if (steal.result === DequeResult.SUCCESS) {
        collectedByThief.push(steal.taskId);
      }
    }

    // All tasks should be collected (no duplicates, no losses)
    const allCollected = [...collectedByOwner, ...collectedByThief].sort((a, b) => a - b);
    expect(allCollected.length).toBe(taskCount);

    // Verify each task ID is present exactly once
    for (let i = 0; i < taskCount; i++) {
      expect(allCollected[i]).toBe(i);
    }

    // Owner should have LIFO (higher IDs)
    // Thief should have FIFO (lower IDs)
    if (collectedByThief.length > 0 && collectedByOwner.length > 0) {
      const avgThief = collectedByThief.reduce((a, b) => a + b, 0) / collectedByThief.length;
      const avgOwner = collectedByOwner.reduce((a, b) => a + b, 0) / collectedByOwner.length;
      // Thief's average should be lower (earlier tasks)
      expect(avgThief).toBeLessThan(avgOwner);
    }
  });
});
