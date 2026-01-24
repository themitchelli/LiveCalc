/**
 * Tests for TimingProfiler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TimingProfiler } from '../src/pipeline/timing-profiler';

describe('TimingProfiler', () => {
  let profiler: TimingProfiler;

  beforeEach(() => {
    // Dispose any existing instance before each test
    TimingProfiler.disposeInstance();
    profiler = TimingProfiler.getInstance();
  });

  it('should create a singleton instance', () => {
    const instance1 = TimingProfiler.getInstance();
    const instance2 = TimingProfiler.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should start a new run', () => {
    profiler.startRun('test-run-1');
    // No assertion needed - just verify it doesn't throw
  });

  it('should record node timing', () => {
    profiler.startRun('test-run-1');
    const startTime = Date.now();
    const endTime = startTime + 100;

    profiler.recordNodeTiming(
      'node-1',
      'Test Node',
      'wasm',
      {
        waitTimeMs: 10,
        initTimeMs: 20,
        executeTimeMs: 60,
        handoffTimeMs: 10,
        totalTimeMs: 100,
      },
      startTime,
      endTime
    );

    const summary = profiler.completeRun();
    expect(summary).toBeDefined();
    expect(summary?.runId).toBe('test-run-1');
    expect(summary?.nodeTimings).toHaveLength(1);
    expect(summary?.nodeTimings[0].nodeId).toBe('node-1');
  });

  it('should calculate timing summary correctly', () => {
    profiler.startRun('test-run-1');
    const baseTime = Date.now();

    profiler.recordNodeTiming(
      'node-1',
      'Node 1',
      'wasm',
      {
        waitTimeMs: 10,
        initTimeMs: 20,
        executeTimeMs: 60,
        handoffTimeMs: 10,
        totalTimeMs: 100,
      },
      baseTime,
      baseTime + 100
    );

    profiler.recordNodeTiming(
      'node-2',
      'Node 2',
      'python',
      {
        waitTimeMs: 5,
        initTimeMs: 15,
        executeTimeMs: 80,
        handoffTimeMs: 0,
        totalTimeMs: 100,
      },
      baseTime + 100,
      baseTime + 200
    );

    const summary = profiler.completeRun();
    expect(summary).toBeDefined();
    expect(summary?.totalInitTimeMs).toBe(35); // 20 + 15
    expect(summary?.totalExecuteTimeMs).toBe(140); // 60 + 80
    expect(summary?.totalHandoffTimeMs).toBe(10); // 10 + 0
    expect(summary?.slowestNodeId).toBe('node-2'); // Both 100ms, but node-2 has more execute time
  });

  it('should identify slowest node', () => {
    profiler.startRun('test-run-1');
    const baseTime = Date.now();

    profiler.recordNodeTiming(
      'fast-node',
      'Fast',
      'wasm',
      {
        waitTimeMs: 0,
        initTimeMs: 10,
        executeTimeMs: 40,
        handoffTimeMs: 0,
        totalTimeMs: 50,
      },
      baseTime,
      baseTime + 50
    );

    profiler.recordNodeTiming(
      'slow-node',
      'Slow',
      'wasm',
      {
        waitTimeMs: 0,
        initTimeMs: 20,
        executeTimeMs: 130,
        handoffTimeMs: 0,
        totalTimeMs: 150,
      },
      baseTime + 50,
      baseTime + 200
    );

    const summary = profiler.completeRun();
    expect(summary?.slowestNodeId).toBe('slow-node');
    expect(summary?.slowestNodeTimeMs).toBe(150);
  });

  it('should maintain run history', () => {
    // Run 1
    profiler.startRun('run-1');
    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 40,
      handoffTimeMs: 0,
      totalTimeMs: 50,
    }, Date.now(), Date.now() + 50);
    profiler.completeRun();

    // Run 2
    profiler.startRun('run-2');
    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 40,
      handoffTimeMs: 0,
      totalTimeMs: 50,
    }, Date.now(), Date.now() + 50);
    profiler.completeRun();

    const history = profiler.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].runId).toBe('run-1');
    expect(history[1].runId).toBe('run-2');
  });

  it('should get summary by run ID', () => {
    profiler.startRun('test-run');
    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 40,
      handoffTimeMs: 0,
      totalTimeMs: 50,
    }, Date.now(), Date.now() + 50);
    profiler.completeRun();

    const summary = profiler.getSummary('test-run');
    expect(summary).toBeDefined();
    expect(summary?.runId).toBe('test-run');
  });

  it('should get most recent summary', () => {
    profiler.startRun('run-1');
    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 40,
      handoffTimeMs: 0,
      totalTimeMs: 50,
    }, Date.now(), Date.now() + 50);
    profiler.completeRun();

    profiler.startRun('run-2');
    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 40,
      handoffTimeMs: 0,
      totalTimeMs: 50,
    }, Date.now(), Date.now() + 50);
    profiler.completeRun();

    const recent = profiler.getMostRecent();
    expect(recent?.runId).toBe('run-2');
  });

  it('should compare two runs', () => {
    // Baseline run
    profiler.startRun('baseline');
    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 40,
      handoffTimeMs: 0,
      totalTimeMs: 50,
    }, Date.now(), Date.now() + 50);
    profiler.completeRun();

    // Current run (slower)
    profiler.startRun('current');
    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 60,
      handoffTimeMs: 0,
      totalTimeMs: 70,
    }, Date.now(), Date.now() + 70);
    profiler.completeRun();

    const comparison = profiler.compareRuns('current', 'baseline');
    expect(comparison).toBeDefined();
    expect(comparison?.baselineRunId).toBe('baseline');
    expect(comparison?.currentRunId).toBe('current');
    expect(comparison?.totalTimeDeltaMs).toBeGreaterThan(0); // Current is slower
    expect(comparison?.slowerNodes).toContain('node-1');
  });

  it('should generate waterfall data', () => {
    profiler.startRun('test-run');
    const baseTime = Date.now();

    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 10,
      initTimeMs: 20,
      executeTimeMs: 60,
      handoffTimeMs: 10,
      totalTimeMs: 100,
    }, baseTime, baseTime + 100);

    profiler.completeRun();

    const waterfall = profiler.generateWaterfallData();
    expect(waterfall).toBeDefined();
    expect(waterfall?.bars.length).toBeGreaterThan(0);
    expect(waterfall?.runId).toBe('test-run');
  });

  it('should export timing data as JSON', () => {
    profiler.startRun('test-run');
    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 40,
      handoffTimeMs: 0,
      totalTimeMs: 50,
    }, Date.now(), Date.now() + 50);
    profiler.completeRun();

    const json = profiler.exportToJson();
    expect(json).toBeDefined();
    const parsed = JSON.parse(json!);
    expect(parsed.runId).toBe('test-run');
  });

  it('should clear history', () => {
    profiler.startRun('test-run');
    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 40,
      handoffTimeMs: 0,
      totalTimeMs: 50,
    }, Date.now(), Date.now() + 50);
    profiler.completeRun();

    expect(profiler.getHistory()).toHaveLength(1);

    profiler.clearHistory();
    expect(profiler.getHistory()).toHaveLength(0);
  });

  it('should detect parallel execution', () => {
    profiler.startRun('test-run');
    const baseTime = Date.now();

    // Two nodes that execute in parallel (both start around the same time)
    profiler.recordNodeTiming('node-1', 'Node 1', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 90,
      handoffTimeMs: 0,
      totalTimeMs: 100,
    }, baseTime, baseTime + 100);

    profiler.recordNodeTiming('node-2', 'Node 2', 'wasm', {
      waitTimeMs: 0,
      initTimeMs: 10,
      executeTimeMs: 90,
      handoffTimeMs: 0,
      totalTimeMs: 100,
    }, baseTime + 10, baseTime + 110);

    const summary = profiler.completeRun();
    // Wall clock time should be much less than sum of node times (200ms)
    // hasParallelExecution should be true
    expect(summary?.hasParallelExecution).toBe(true);
  });
});
