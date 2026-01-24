/**
 * Pipeline Orchestrator Module
 *
 * Provides memory management and coordination for multi-engine pipelines
 * using SharedArrayBuffer and zero-copy data sharing.
 *
 * @module orchestrator
 */

// Memory offset manager
export {
  MemoryOffsetManager,
  MemoryAllocationError,
  parseBusResourceSize,
} from './memory-manager.js';

export type {
  MemoryBlock,
  MemoryOffsetMap,
  MemoryOffsetMapJSON,
  MemoryManagerConfig,
  BusResourceRequirement,
  TypedArrayType,
} from './memory-manager.js';

// Atomic signal manager for node coordination
export {
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
} from './atomic-signals.js';

export type {
  WaitResult,
  SignalTiming,
  MessageHandoffConfig,
} from './atomic-signals.js';

// Pipeline error handling
export {
  PipelineError,
  PipelineErrorHandler,
  PipelineErrorCode,
  createFailedResult,
  createSuccessResult,
  createEmptyNodeTiming,
} from './pipeline-error.js';

export type {
  PipelineStage,
  PipelineErrorSeverity,
  PipelineErrorInfo,
  BusDataSnapshot,
  InputSnapshot,
  PipelineExecutionResult,
  NodeExecutionResult,
  NodeTiming,
} from './pipeline-error.js';

// Integrity checker for bus resources
export {
  IntegrityChecker,
  createIntegrityChecker,
  computeCRC32,
} from './integrity-checker.js';

export type {
  IntegrityCheckResult,
  IntegrityReport,
} from './integrity-checker.js';
