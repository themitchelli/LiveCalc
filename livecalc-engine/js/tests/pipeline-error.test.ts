/**
 * Tests for Pipeline Error Handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PipelineError,
  PipelineErrorHandler,
  PipelineErrorCode,
  createFailedResult,
  createSuccessResult,
  createEmptyNodeTiming,
  type NodeExecutionResult,
  type NodeTiming,
} from '../src/orchestrator/pipeline-error.js';
import { NodeState, MessageBasedSignalManager } from '../src/orchestrator/atomic-signals.js';

describe('PipelineError', () => {
  describe('constructor', () => {
    it('creates error with all required fields', () => {
      const error = new PipelineError({
        nodeId: 'test-node',
        message: 'Test error message',
      });

      expect(error.info.nodeId).toBe('test-node');
      expect(error.info.message).toBe('Test error message');
      expect(error.info.stage).toBe('execute');
      expect(error.info.code).toBe(PipelineErrorCode.UNKNOWN);
      expect(error.info.severity).toBe('error');
      expect(error.info.errorId).toMatch(/^err_/);
      expect(error.info.timestamp).toBeDefined();
    });

    it('creates error with all optional fields', () => {
      const cause = new Error('Original error');
      const inputSnapshot = {
        inputs: new Map([['bus://test/input', { name: 'bus://test/input', sample: [1, 2, 3], elementCount: 100 }]]),
        outputs: new Map(),
        timestamp: Date.now(),
      };

      const error = new PipelineError({
        nodeId: 'test-node',
        message: 'Test error',
        stage: 'init',
        code: PipelineErrorCode.ENGINE_INIT_FAILED,
        severity: 'fatal',
        cause,
        inputSnapshot,
        nodeState: NodeState.ERROR,
        executionTimeMs: 1234,
        details: { key: 'value' },
      });

      expect(error.info.stage).toBe('init');
      expect(error.info.code).toBe(PipelineErrorCode.ENGINE_INIT_FAILED);
      expect(error.info.severity).toBe('fatal');
      expect(error.info.cause).toBe(cause);
      expect(error.info.inputSnapshot).toBe(inputSnapshot);
      expect(error.info.nodeState).toBe(NodeState.ERROR);
      expect(error.info.executionTimeMs).toBe(1234);
      expect(error.info.details).toEqual({ key: 'value' });
    });

    it('provides guidance based on error code', () => {
      const error = new PipelineError({
        nodeId: 'test-node',
        message: 'Test error',
        code: PipelineErrorCode.TIMEOUT,
      });

      expect(error.info.guidance?.toLowerCase()).toContain('timed out');
    });

    it('includes cause stack in error stack', () => {
      const cause = new Error('Original error');
      const error = new PipelineError({
        nodeId: 'test-node',
        message: 'Wrapper error',
        cause,
      });

      expect(error.stack).toContain('Caused by:');
      expect(error.stack).toContain('Original error');
    });
  });

  describe('from', () => {
    it('returns existing PipelineError unchanged', () => {
      const original = new PipelineError({
        nodeId: 'test-node',
        message: 'Original error',
      });

      const result = PipelineError.from(original, 'other-node', 'init');

      expect(result).toBe(original);
    });

    it('wraps Error object', () => {
      const error = new Error('Test error');
      const result = PipelineError.from(error, 'test-node', 'execute');

      expect(result.info.nodeId).toBe('test-node');
      expect(result.info.stage).toBe('execute');
      expect(result.info.message).toBe('Test error');
      expect(result.info.cause).toBe(error);
    });

    it('wraps string error', () => {
      const result = PipelineError.from('String error', 'test-node', 'load');

      expect(result.info.nodeId).toBe('test-node');
      expect(result.info.stage).toBe('load');
      expect(result.info.message).toBe('String error');
    });

    it('classifies memory errors', () => {
      const error = new Error('Out of memory');
      const result = PipelineError.from(error, 'test-node', 'execute');

      expect(result.info.code).toBe(PipelineErrorCode.OUT_OF_MEMORY);
    });

    it('classifies timeout errors', () => {
      const error = new Error('Operation timed out');
      const result = PipelineError.from(error, 'test-node', 'execute');

      expect(result.info.code).toBe(PipelineErrorCode.TIMEOUT);
    });

    it('classifies numerical errors', () => {
      const error = new Error('Result is NaN');
      const result = PipelineError.from(error, 'test-node', 'execute');

      expect(result.info.code).toBe(PipelineErrorCode.NUMERICAL_ERROR);
    });

    it('classifies cancelled errors', () => {
      const error = new Error('Operation cancelled');
      const result = PipelineError.from(error, 'test-node', 'execute');

      expect(result.info.code).toBe(PipelineErrorCode.CANCELLED);
    });

    it('includes additional context', () => {
      const error = new Error('Test error');
      const result = PipelineError.from(error, 'test-node', 'execute', {
        executionTimeMs: 5000,
        details: { attempt: 1 },
      });

      expect(result.info.executionTimeMs).toBe(5000);
      expect(result.info.details).toEqual({ attempt: 1 });
    });
  });

  describe('toJSON', () => {
    it('returns JSON-serializable representation', () => {
      const error = new PipelineError({
        nodeId: 'test-node',
        message: 'Test error',
        stage: 'execute',
        code: PipelineErrorCode.EXECUTION_FAILED,
        nodeState: NodeState.ERROR,
        allNodeStates: { 'test-node': NodeState.ERROR, 'other-node': NodeState.COMPLETE },
      });

      const json = error.toJSON();

      expect(json.nodeId).toBe('test-node');
      expect(json.message).toBe('Test error');
      expect(json.stage).toBe('execute');
      expect(json.code).toBe('EXECUTION_FAILED');
      expect(json.nodeState).toBe('ERROR');
      expect(json.allNodeStates).toEqual({ 'test-node': 'ERROR', 'other-node': 'COMPLETE' });

      // Should be JSON serializable
      expect(() => JSON.stringify(json)).not.toThrow();
    });
  });
});

describe('PipelineErrorHandler', () => {
  let handler: PipelineErrorHandler;

  beforeEach(() => {
    handler = new PipelineErrorHandler();
  });

  describe('handleError in fail-fast mode', () => {
    it('throws error immediately in fail-fast mode', () => {
      expect(() => {
        handler.handleError(new Error('Test error'), 'test-node', 'execute');
      }).toThrow(PipelineError);
    });

    it('records error before throwing', () => {
      try {
        handler.handleError(new Error('Test error'), 'test-node', 'execute');
      } catch {
        // Expected
      }

      expect(handler.hasErrors()).toBe(true);
      expect(handler.errorCount).toBe(1);
    });
  });

  describe('handleError in continue-on-error mode', () => {
    beforeEach(() => {
      handler = new PipelineErrorHandler({ continueOnError: true });
    });

    it('records error without throwing', () => {
      const result = handler.handleError(new Error('Test error'), 'test-node', 'execute');

      expect(result).toBeInstanceOf(PipelineError);
      expect(handler.hasErrors()).toBe(true);
      expect(handler.errorCount).toBe(1);
    });

    it('records multiple errors', () => {
      handler.handleError(new Error('Error 1'), 'node-1', 'execute');
      handler.handleError(new Error('Error 2'), 'node-2', 'execute');
      handler.handleError(new Error('Error 3'), 'node-3', 'execute');

      expect(handler.errorCount).toBe(3);
    });

    it('limits stored errors to maxErrors', () => {
      handler = new PipelineErrorHandler({ continueOnError: true, maxErrors: 2 });

      handler.handleError(new Error('Error 1'), 'node-1', 'execute');
      handler.handleError(new Error('Error 2'), 'node-2', 'execute');
      handler.handleError(new Error('Error 3'), 'node-3', 'execute');

      expect(handler.errorCount).toBe(2);
      // First error should be removed
      const errors = handler.getErrors();
      expect(errors[0].info.message).toBe('Error 2');
      expect(errors[1].info.message).toBe('Error 3');
    });
  });

  describe('getPrimaryError', () => {
    it('returns first error', () => {
      handler = new PipelineErrorHandler({ continueOnError: true });

      handler.handleError(new Error('First error'), 'node-1', 'execute');
      handler.handleError(new Error('Second error'), 'node-2', 'execute');

      const primary = handler.getPrimaryError();
      expect(primary?.info.message).toBe('First error');
    });

    it('returns undefined when no errors', () => {
      expect(handler.getPrimaryError()).toBeUndefined();
    });
  });

  describe('recordError', () => {
    it('records error without throwing even in fail-fast mode', () => {
      const error = new PipelineError({
        nodeId: 'test-node',
        message: 'Test error',
      });

      handler.recordError(error);

      expect(handler.hasErrors()).toBe(true);
      expect(handler.getErrors()[0]).toBe(error);
    });
  });

  describe('clearErrors', () => {
    it('clears all recorded errors', () => {
      handler = new PipelineErrorHandler({ continueOnError: true });

      handler.handleError(new Error('Error 1'), 'node-1', 'execute');
      handler.handleError(new Error('Error 2'), 'node-2', 'execute');

      expect(handler.errorCount).toBe(2);

      handler.clearErrors();

      expect(handler.hasErrors()).toBe(false);
      expect(handler.errorCount).toBe(0);
    });
  });

  describe('getAllNodeStates', () => {
    it('returns all node states from signal manager', () => {
      const signalManager = new MessageBasedSignalManager(['node-1', 'node-2', 'node-3']);
      signalManager.signal('node-1', NodeState.COMPLETE);
      signalManager.signal('node-2', NodeState.ERROR);
      signalManager.signal('node-3', NodeState.IDLE);

      const states = handler.getAllNodeStates(signalManager);

      expect(states['node-1']).toBe(NodeState.COMPLETE);
      expect(states['node-2']).toBe(NodeState.ERROR);
      expect(states['node-3']).toBe(NodeState.IDLE);
    });
  });

  describe('createErrorSummary', () => {
    beforeEach(() => {
      handler = new PipelineErrorHandler({ continueOnError: true });
    });

    it('returns summary with no errors', () => {
      const summary = handler.createErrorSummary();

      expect(summary.totalErrors).toBe(0);
      expect(summary.primaryError).toBeUndefined();
      expect(summary.affectedNodes).toEqual([]);
      expect(summary.errorsByStage.execute).toBe(0);
    });

    it('returns summary with errors', () => {
      handler.handleError(new Error('Init error'), 'node-1', 'init');
      handler.handleError(new Error('Exec error 1'), 'node-2', 'execute');
      handler.handleError(new Error('Exec error 2'), 'node-3', 'execute');
      handler.handleError(new Error('Handoff error'), 'node-2', 'handoff');

      const summary = handler.createErrorSummary();

      expect(summary.totalErrors).toBe(4);
      expect(summary.primaryError?.nodeId).toBe('node-1');
      expect(summary.primaryError?.stage).toBe('init');
      expect(summary.affectedNodes).toContain('node-1');
      expect(summary.affectedNodes).toContain('node-2');
      expect(summary.affectedNodes).toContain('node-3');
      expect(summary.errorsByStage.init).toBe(1);
      expect(summary.errorsByStage.execute).toBe(2);
      expect(summary.errorsByStage.handoff).toBe(1);
    });
  });
});

describe('PipelineExecutionResult helpers', () => {
  describe('createEmptyNodeTiming', () => {
    it('creates timing object with all zeros', () => {
      const timing = createEmptyNodeTiming();

      expect(timing.waitTimeMs).toBe(0);
      expect(timing.initTimeMs).toBe(0);
      expect(timing.executeTimeMs).toBe(0);
      expect(timing.handoffTimeMs).toBe(0);
      expect(timing.totalTimeMs).toBe(0);
    });
  });

  describe('createFailedResult', () => {
    it('creates failed result with error and partial results', () => {
      const error = new PipelineError({
        nodeId: 'node-2',
        message: 'Execution failed',
        code: PipelineErrorCode.EXECUTION_FAILED,
      });

      const partialResults = new Map<string, NodeExecutionResult>();
      partialResults.set('node-1', {
        nodeId: 'node-1',
        success: true,
        state: NodeState.COMPLETE,
        outputs: ['bus://test/output'],
        timing: createEmptyNodeTiming(),
      });

      const timing = new Map<string, NodeTiming>();
      timing.set('node-1', { ...createEmptyNodeTiming(), totalTimeMs: 100 });
      timing.set('node-2', { ...createEmptyNodeTiming(), totalTimeMs: 50 });

      const result = createFailedResult(
        error,
        partialResults,
        timing,
        ['node-1'],
        ['node-1', 'node-2', 'node-3']
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(error.info);
      expect(result.errors).toHaveLength(1);
      expect(result.completedNodes).toEqual(['node-1']);
      expect(result.failedNodes).toEqual(['node-2']);
      expect(result.skippedNodes).toEqual(['node-3']);
      expect(result.partialResults.get('node-1')).toBeDefined();
      expect(result.totalTimeMs).toBe(150);
    });
  });

  describe('createSuccessResult', () => {
    it('creates successful result', () => {
      const data = { npv: 1000000 };
      const partialResults = new Map<string, NodeExecutionResult>();
      const timing = new Map<string, NodeTiming>();
      timing.set('node-1', { ...createEmptyNodeTiming(), totalTimeMs: 100 });
      timing.set('node-2', { ...createEmptyNodeTiming(), totalTimeMs: 200 });

      const result = createSuccessResult(
        data,
        partialResults,
        timing,
        ['node-1', 'node-2']
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(data);
      expect(result.errors).toHaveLength(0);
      expect(result.completedNodes).toEqual(['node-1', 'node-2']);
      expect(result.failedNodes).toHaveLength(0);
      expect(result.skippedNodes).toHaveLength(0);
      expect(result.totalTimeMs).toBe(300);
    });
  });
});

describe('PipelineErrorCode', () => {
  it('has unique values for all codes', () => {
    const values = Object.values(PipelineErrorCode);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it('includes all expected error categories', () => {
    // Initialization errors
    expect(PipelineErrorCode.ENGINE_INIT_FAILED).toBeDefined();
    expect(PipelineErrorCode.ENGINE_NOT_FOUND).toBeDefined();
    expect(PipelineErrorCode.MEMORY_ALLOCATION_FAILED).toBeDefined();
    expect(PipelineErrorCode.WORKER_INIT_FAILED).toBeDefined();

    // Data loading errors
    expect(PipelineErrorCode.DATA_LOAD_FAILED).toBeDefined();
    expect(PipelineErrorCode.INVALID_INPUT_FORMAT).toBeDefined();
    expect(PipelineErrorCode.MISSING_REQUIRED_INPUT).toBeDefined();
    expect(PipelineErrorCode.INPUT_SIZE_MISMATCH).toBeDefined();

    // Execution errors
    expect(PipelineErrorCode.EXECUTION_FAILED).toBeDefined();
    expect(PipelineErrorCode.TIMEOUT).toBeDefined();
    expect(PipelineErrorCode.OUT_OF_MEMORY).toBeDefined();
    expect(PipelineErrorCode.NUMERICAL_ERROR).toBeDefined();
    expect(PipelineErrorCode.ASSERTION_FAILED).toBeDefined();

    // Handoff errors
    expect(PipelineErrorCode.HANDOFF_FAILED).toBeDefined();
    expect(PipelineErrorCode.UPSTREAM_TIMEOUT).toBeDefined();
    expect(PipelineErrorCode.UPSTREAM_ERROR).toBeDefined();
    expect(PipelineErrorCode.INTEGRITY_CHECK_FAILED).toBeDefined();

    // Finalization errors
    expect(PipelineErrorCode.OUTPUT_WRITE_FAILED).toBeDefined();
    expect(PipelineErrorCode.OUTPUT_SIZE_MISMATCH).toBeDefined();

    // Cancellation
    expect(PipelineErrorCode.CANCELLED).toBeDefined();

    // Unknown
    expect(PipelineErrorCode.UNKNOWN).toBeDefined();
  });
});
