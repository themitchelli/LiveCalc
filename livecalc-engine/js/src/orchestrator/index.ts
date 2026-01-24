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
