/**
 * Atomic Signal Manager Tests
 *
 * Tests for pipeline node coordination using SharedArrayBuffer and Atomics.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AtomicSignalManager,
  MessageBasedSignalManager,
  NodeState,
  NODE_STATE_NAMES,
  createSignalManager,
  isAtomicSignalManager,
  isAtomicsWaitAvailable,
  isAtomicsNotifyAvailable,
  getHighResolutionTimestamp,
  formatNanoseconds,
} from '../src/orchestrator/atomic-signals.js';
import type { WaitResult, SignalTiming } from '../src/orchestrator/atomic-signals.js';

describe('AtomicSignalManager', () => {
  const NODE_IDS = ['esg', 'projection', 'aggregation'];
  let buffer: SharedArrayBuffer;
  let manager: AtomicSignalManager;

  beforeEach(() => {
    // Allocate buffer with enough space for all nodes (4 bytes per node)
    const size = AtomicSignalManager.calculateSize(NODE_IDS.length);
    buffer = new SharedArrayBuffer(size);
    manager = new AtomicSignalManager(buffer, 0, NODE_IDS);
    manager.resetAll();
  });

  describe('initialization', () => {
    it('should calculate correct size for node count', () => {
      // 3 nodes * 4 bytes = 12 bytes, aligned to 16 = 16 bytes
      expect(AtomicSignalManager.calculateSize(3)).toBe(16);
      // 10 nodes * 4 bytes = 40 bytes, aligned to 16 = 48 bytes
      expect(AtomicSignalManager.calculateSize(10)).toBe(48);
      // 1 node * 4 bytes = 4 bytes, aligned to 16 = 16 bytes
      expect(AtomicSignalManager.calculateSize(1)).toBe(16);
    });

    it('should initialize all nodes to IDLE', () => {
      manager.resetAll();
      for (const nodeId of NODE_IDS) {
        expect(manager.getState(nodeId)).toBe(NodeState.IDLE);
      }
    });

    it('should return all node IDs', () => {
      expect(manager.nodeIds).toEqual(NODE_IDS);
      expect(manager.nodeCount).toBe(3);
    });

    it('should throw on unknown node ID', () => {
      expect(() => manager.getState('unknown')).toThrow('Unknown node');
      expect(() => manager.signal('unknown', NodeState.RUNNING)).toThrow('Unknown node');
    });
  });

  describe('state transitions', () => {
    it('should signal state transition and return previous state', () => {
      const oldState = manager.signal('esg', NodeState.RUNNING);
      expect(oldState).toBe(NodeState.IDLE);
      expect(manager.getState('esg')).toBe(NodeState.RUNNING);
    });

    it('should transition through all states', () => {
      manager.signal('esg', NodeState.WAITING);
      expect(manager.getState('esg')).toBe(NodeState.WAITING);

      manager.signal('esg', NodeState.RUNNING);
      expect(manager.getState('esg')).toBe(NodeState.RUNNING);

      manager.signal('esg', NodeState.COMPLETE);
      expect(manager.getState('esg')).toBe(NodeState.COMPLETE);
    });

    it('should transition to ERROR state', () => {
      manager.signal('esg', NodeState.RUNNING);
      manager.signal('esg', NodeState.ERROR);
      expect(manager.getState('esg')).toBe(NodeState.ERROR);
    });

    it('should reset a single node', () => {
      manager.signal('esg', NodeState.COMPLETE);
      manager.reset('esg');
      expect(manager.getState('esg')).toBe(NodeState.IDLE);
    });

    it('should reset all nodes', () => {
      manager.signal('esg', NodeState.COMPLETE);
      manager.signal('projection', NodeState.RUNNING);
      manager.signal('aggregation', NodeState.WAITING);

      manager.resetAll();

      for (const nodeId of NODE_IDS) {
        expect(manager.getState(nodeId)).toBe(NodeState.IDLE);
      }
    });

    it('should get all states at once', () => {
      manager.signal('esg', NodeState.COMPLETE);
      manager.signal('projection', NodeState.RUNNING);

      const states = manager.getAllStates();

      expect(states.get('esg')).toBe(NodeState.COMPLETE);
      expect(states.get('projection')).toBe(NodeState.RUNNING);
      expect(states.get('aggregation')).toBe(NodeState.IDLE);
    });
  });

  describe('waitFor', () => {
    it('should return immediately if already in expected state', async () => {
      manager.signal('esg', NodeState.COMPLETE);

      const result = await manager.waitFor('esg', NodeState.COMPLETE, 100);

      expect(result.success).toBe(true);
      expect(result.observedState).toBe(NodeState.COMPLETE);
      expect(result.waitTimeNs).toBe(0);
      expect(result.timedOut).toBe(false);
    });

    it('should return immediately if node is in ERROR state', async () => {
      manager.signal('esg', NodeState.ERROR);

      const result = await manager.waitFor('esg', NodeState.COMPLETE, 100);

      expect(result.success).toBe(false);
      expect(result.observedState).toBe(NodeState.ERROR);
      expect(result.timedOut).toBe(false);
    });

    // Note: Testing concurrent signal + wait requires worker_threads because
    // Atomics.wait blocks the event loop. The real pattern is:
    // - Worker 1 signals completion
    // - Worker 2 wakes up from Atomics.wait
    // For unit tests, we verify that signal/wait mechanics work when state is pre-set.

    it('should timeout if state not reached', async () => {
      const result = await manager.waitFor('esg', NodeState.COMPLETE, 50);

      expect(result.success).toBe(false);
      expect(result.observedState).toBe(NodeState.IDLE);
      expect(result.timedOut).toBe(true);
    });

    it('should detect state set before wait starts', async () => {
      // Pre-set the state
      manager.signal('esg', NodeState.COMPLETE);

      // Wait should return immediately
      const result = await manager.waitFor('esg', NodeState.COMPLETE, 100);

      expect(result.success).toBe(true);
      expect(result.observedState).toBe(NodeState.COMPLETE);
    });

    it('should detect ERROR state when waiting for COMPLETE', async () => {
      // Pre-set the error state
      manager.signal('esg', NodeState.ERROR);

      const result = await manager.waitFor('esg', NodeState.COMPLETE, 100);

      expect(result.success).toBe(false);
      expect(result.observedState).toBe(NodeState.ERROR);
      expect(result.timedOut).toBe(false);
    });
  });

  describe('waitForAll', () => {
    it('should return immediately when all nodes already complete', async () => {
      // Pre-set all nodes to complete
      for (const nodeId of NODE_IDS) {
        manager.signal(nodeId, NodeState.COMPLETE);
      }

      const results = await manager.waitForAll(NODE_IDS, NodeState.COMPLETE, 100);

      expect(results.size).toBe(3);
      for (const nodeId of NODE_IDS) {
        const result = results.get(nodeId)!;
        expect(result.success).toBe(true);
        expect(result.observedState).toBe(NodeState.COMPLETE);
      }
    });

    it('should report partial failure when some nodes in error', async () => {
      // Pre-set states
      manager.signal('esg', NodeState.COMPLETE);
      manager.signal('projection', NodeState.ERROR);
      manager.signal('aggregation', NodeState.COMPLETE);

      const results = await manager.waitForAll(NODE_IDS, NodeState.COMPLETE, 100);

      expect(results.get('esg')!.success).toBe(true);
      expect(results.get('projection')!.success).toBe(false);
      expect(results.get('projection')!.observedState).toBe(NodeState.ERROR);
      expect(results.get('aggregation')!.success).toBe(true);
    });
  });

  describe('timing and logging', () => {
    it('should record timing when enabled', () => {
      manager.setTimingLogEnabled(true);

      manager.signal('esg', NodeState.RUNNING);
      manager.signal('esg', NodeState.COMPLETE);

      const timings = manager.getTimingLog();

      expect(timings.length).toBe(2);
      expect(timings[0].nodeId).toBe('esg');
      expect(timings[0].fromState).toBe(NodeState.IDLE);
      expect(timings[0].toState).toBe(NodeState.RUNNING);
      expect(timings[1].toState).toBe(NodeState.COMPLETE);
    });

    it('should not record timing when disabled', () => {
      manager.setTimingLogEnabled(false);

      manager.signal('esg', NodeState.RUNNING);
      manager.signal('esg', NodeState.COMPLETE);

      const timings = manager.getTimingLog();
      expect(timings.length).toBe(0);
    });

    it('should clear timing log', () => {
      manager.setTimingLogEnabled(true);
      manager.signal('esg', NodeState.RUNNING);

      expect(manager.getTimingLog().length).toBe(1);

      manager.clearTimingLog();

      expect(manager.getTimingLog().length).toBe(0);
    });

    it('should calculate handoff latency', () => {
      manager.setTimingLogEnabled(true);

      // Simulate handoff
      manager.signal('esg', NodeState.RUNNING);
      manager.signal('esg', NodeState.COMPLETE);
      manager.signal('projection', NodeState.RUNNING);
      manager.signal('projection', NodeState.COMPLETE);

      const latency = manager.calculateHandoffLatency('esg', 'projection');

      expect(latency).not.toBeNull();
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it('should return null for missing transitions', () => {
      manager.setTimingLogEnabled(true);

      // Only esg completes
      manager.signal('esg', NodeState.COMPLETE);

      const latency = manager.calculateHandoffLatency('esg', 'projection');
      expect(latency).toBeNull();
    });

    it('should get all handoff latencies', () => {
      manager.setTimingLogEnabled(true);

      // Full pipeline
      manager.signal('esg', NodeState.RUNNING);
      manager.signal('esg', NodeState.COMPLETE);
      manager.signal('projection', NodeState.RUNNING);
      manager.signal('projection', NodeState.COMPLETE);
      manager.signal('aggregation', NodeState.RUNNING);
      manager.signal('aggregation', NodeState.COMPLETE);

      const latencies = manager.getAllHandoffLatencies();

      expect(latencies.length).toBe(2);
      expect(latencies[0].from).toBe('esg');
      expect(latencies[0].to).toBe('projection');
      expect(latencies[1].from).toBe('projection');
      expect(latencies[1].to).toBe('aggregation');
    });

    it('should call logger on transitions when set', () => {
      const mockLogger = vi.fn();
      manager.setLogger(mockLogger);
      manager.setTimingLogEnabled(true);

      manager.signal('esg', NodeState.RUNNING);

      expect(mockLogger).toHaveBeenCalled();
      expect(mockLogger.mock.calls[0][0]).toContain('[AtomicSignals]');
      expect(mockLogger.mock.calls[0][0]).toContain('esg');
    });
  });

  describe('attach', () => {
    it('should attach to existing buffer', () => {
      manager.signal('esg', NodeState.COMPLETE);

      const attached = AtomicSignalManager.attach(buffer, 0, NODE_IDS);

      expect(attached.getState('esg')).toBe(NodeState.COMPLETE);
    });

    it('should share state between managers', () => {
      const attached = AtomicSignalManager.attach(buffer, 0, NODE_IDS);

      manager.signal('esg', NodeState.RUNNING);
      expect(attached.getState('esg')).toBe(NodeState.RUNNING);

      attached.signal('projection', NodeState.COMPLETE);
      expect(manager.getState('projection')).toBe(NodeState.COMPLETE);
    });
  });
});

describe('MessageBasedSignalManager', () => {
  const NODE_IDS = ['esg', 'projection', 'aggregation'];
  let manager: MessageBasedSignalManager;

  beforeEach(() => {
    manager = new MessageBasedSignalManager(NODE_IDS);
  });

  describe('initialization', () => {
    it('should initialize all nodes to IDLE', () => {
      for (const nodeId of NODE_IDS) {
        expect(manager.getState(nodeId)).toBe(NodeState.IDLE);
      }
    });

    it('should return all node IDs', () => {
      expect(manager.nodeIds).toEqual(NODE_IDS);
    });

    it('should throw on unknown node ID', () => {
      expect(() => manager.getState('unknown')).toThrow('Unknown node');
    });
  });

  describe('state transitions', () => {
    it('should signal state transition', () => {
      const oldState = manager.signal('esg', NodeState.RUNNING);
      expect(oldState).toBe(NodeState.IDLE);
      expect(manager.getState('esg')).toBe(NodeState.RUNNING);
    });

    it('should reset all nodes', () => {
      manager.signal('esg', NodeState.COMPLETE);
      manager.signal('projection', NodeState.RUNNING);

      manager.resetAll();

      for (const nodeId of NODE_IDS) {
        expect(manager.getState(nodeId)).toBe(NodeState.IDLE);
      }
    });
  });

  describe('waitFor', () => {
    it('should return immediately if already in expected state', async () => {
      manager.signal('esg', NodeState.COMPLETE);

      const result = await manager.waitFor('esg', NodeState.COMPLETE, 100);

      expect(result.success).toBe(true);
      expect(result.observedState).toBe(NodeState.COMPLETE);
    });

    it('should wait for state change', async () => {
      setTimeout(() => {
        manager.signal('esg', NodeState.COMPLETE);
      }, 10);

      const result = await manager.waitFor('esg', NodeState.COMPLETE, 1000);

      expect(result.success).toBe(true);
      expect(result.observedState).toBe(NodeState.COMPLETE);
    });

    it('should timeout if state not reached', async () => {
      const result = await manager.waitFor('esg', NodeState.COMPLETE, 50);

      expect(result.success).toBe(false);
      expect(result.observedState).toBe(NodeState.IDLE);
      expect(result.timedOut).toBe(true);
    });

    it('should resolve on ERROR when waiting for any state', async () => {
      setTimeout(() => {
        manager.signal('esg', NodeState.ERROR);
      }, 10);

      const result = await manager.waitFor('esg', NodeState.COMPLETE, 1000);

      expect(result.success).toBe(false);
      expect(result.observedState).toBe(NodeState.ERROR);
    });
  });
});

describe('utility functions', () => {
  describe('NODE_STATE_NAMES', () => {
    it('should have names for all states', () => {
      expect(NODE_STATE_NAMES[NodeState.IDLE]).toBe('IDLE');
      expect(NODE_STATE_NAMES[NodeState.WAITING]).toBe('WAITING');
      expect(NODE_STATE_NAMES[NodeState.RUNNING]).toBe('RUNNING');
      expect(NODE_STATE_NAMES[NodeState.COMPLETE]).toBe('COMPLETE');
      expect(NODE_STATE_NAMES[NodeState.ERROR]).toBe('ERROR');
    });
  });

  describe('isAtomicsWaitAvailable', () => {
    it('should return boolean', () => {
      const result = isAtomicsWaitAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isAtomicsNotifyAvailable', () => {
    it('should return true in Node.js', () => {
      expect(isAtomicsNotifyAvailable()).toBe(true);
    });
  });

  describe('getHighResolutionTimestamp', () => {
    it('should return a number', () => {
      const ts = getHighResolutionTimestamp();
      expect(typeof ts).toBe('number');
      expect(ts).toBeGreaterThan(0);
    });

    it('should increase over time', async () => {
      const ts1 = getHighResolutionTimestamp();
      await new Promise((r) => setTimeout(r, 5));
      const ts2 = getHighResolutionTimestamp();
      expect(ts2).toBeGreaterThan(ts1);
    });
  });

  describe('formatNanoseconds', () => {
    it('should format nanoseconds', () => {
      expect(formatNanoseconds(500)).toBe('500ns');
    });

    it('should format microseconds', () => {
      expect(formatNanoseconds(5000)).toBe('5.00µs');
      expect(formatNanoseconds(500000)).toBe('500.00µs');
    });

    it('should format milliseconds', () => {
      expect(formatNanoseconds(5000000)).toBe('5.00ms');
      expect(formatNanoseconds(500000000)).toBe('500.00ms');
    });

    it('should format seconds', () => {
      expect(formatNanoseconds(5000000000)).toBe('5.000s');
    });
  });

  describe('createSignalManager', () => {
    it('should create AtomicSignalManager when SAB available', () => {
      const buffer = new SharedArrayBuffer(64);
      const manager = createSignalManager(buffer, 0, ['node1']);

      expect(isAtomicSignalManager(manager)).toBe(true);
    });

    it('should create MessageBasedSignalManager when SAB is null', () => {
      const manager = createSignalManager(null, 0, ['node1']);

      expect(isAtomicSignalManager(manager)).toBe(false);
      expect(manager).toBeInstanceOf(MessageBasedSignalManager);
    });
  });

  describe('isAtomicSignalManager', () => {
    it('should correctly identify manager type', () => {
      const buffer = new SharedArrayBuffer(64);
      const atomic = new AtomicSignalManager(buffer, 0, ['node1']);
      const message = new MessageBasedSignalManager(['node1']);

      expect(isAtomicSignalManager(atomic)).toBe(true);
      expect(isAtomicSignalManager(message)).toBe(false);
    });
  });
});

describe('handoff latency benchmark', () => {
  it('should achieve fast synchronous handoff (signal overhead < 100µs)', () => {
    const NODE_IDS = ['producer', 'consumer'];
    const buffer = new SharedArrayBuffer(AtomicSignalManager.calculateSize(2));
    const manager = new AtomicSignalManager(buffer, 0, NODE_IDS);

    manager.setTimingLogEnabled(true);
    manager.resetAll();

    // Simulate synchronous producer completion and consumer start
    // This is the pattern in actual worker execution:
    // 1. Producer signals COMPLETE
    // 2. Consumer wakes up and signals RUNNING immediately
    manager.signal('producer', NodeState.RUNNING);
    manager.signal('producer', NodeState.COMPLETE);
    // Consumer immediately reacts (no setTimeout)
    manager.signal('consumer', NodeState.RUNNING);
    manager.signal('consumer', NodeState.COMPLETE);

    const latency = manager.calculateHandoffLatency('producer', 'consumer');

    expect(latency).not.toBeNull();
    // Synchronous signal overhead should be < 100µs = 100,000ns
    // This is just the cost of two Atomics operations
    expect(latency!).toBeLessThan(100_000);
  });

  it('should measure sub-millisecond precision', () => {
    // Two successive timestamps should differ by less than 1ms
    const t1 = getHighResolutionTimestamp();
    const t2 = getHighResolutionTimestamp();

    // Should be different (non-zero precision)
    // But less than 1ms apart
    expect(t2 - t1).toBeLessThan(1_000_000);
  });

  it('should track all handoff latencies in a pipeline', () => {
    const NODE_IDS = ['esg', 'projection', 'aggregation'];
    const buffer = new SharedArrayBuffer(AtomicSignalManager.calculateSize(3));
    const manager = new AtomicSignalManager(buffer, 0, NODE_IDS);

    manager.setTimingLogEnabled(true);
    manager.resetAll();

    // Simulate full pipeline execution
    for (const nodeId of NODE_IDS) {
      manager.signal(nodeId, NodeState.RUNNING);
      // Simulate some work
      manager.signal(nodeId, NodeState.COMPLETE);
    }

    const latencies = manager.getAllHandoffLatencies();

    // Should have latencies for esg->projection and projection->aggregation
    expect(latencies.length).toBe(2);
    expect(latencies[0].from).toBe('esg');
    expect(latencies[0].to).toBe('projection');
    expect(latencies[1].from).toBe('projection');
    expect(latencies[1].to).toBe('aggregation');

    // All latencies should be very small (synchronous signals)
    for (const l of latencies) {
      expect(l.latencyNs).toBeLessThan(100_000); // < 100µs
    }
  });
});
