/**
 * @livecalc/engine - JavaScript wrapper for LiveCalc WASM projection engine
 *
 * This package provides a clean TypeScript/JavaScript API for the LiveCalc
 * actuarial projection engine compiled to WebAssembly.
 *
 * ## Single-threaded Usage
 *
 * @example
 * ```typescript
 * import { LiveCalcEngine, DEFAULT_SCENARIO_PARAMS } from '@livecalc/engine';
 * import createModule from './livecalc.mjs';
 *
 * async function main() {
 *   const engine = new LiveCalcEngine();
 *   await engine.initialize(createModule);
 *
 *   // Load data from CSV files
 *   engine.loadPoliciesFromCsv(policiesCsv);
 *   engine.loadMortalityFromCsv(mortalityCsv);
 *   engine.loadLapseFromCsv(lapseCsv);
 *   engine.loadExpensesFromCsv(expensesCsv);
 *
 *   // Run valuation
 *   const result = engine.runValuation({
 *     numScenarios: 1000,
 *     seed: 42,
 *     scenarioParams: DEFAULT_SCENARIO_PARAMS,
 *     storeDistribution: true,
 *   });
 *
 *   console.log('Mean NPV:', result.statistics.meanNpv);
 *   console.log('CTE 95:', result.statistics.cte95);
 *
 *   engine.dispose();
 * }
 * ```
 *
 * ## Parallel Execution with Worker Pool
 *
 * @example
 * ```typescript
 * import { WorkerPool, DEFAULT_SCENARIO_PARAMS } from '@livecalc/engine';
 *
 * async function main() {
 *   const pool = new WorkerPool({
 *     numWorkers: 8,
 *     workerScript: '/livecalc-worker.js',
 *     wasmPath: '/livecalc.mjs',
 *   });
 *
 *   await pool.initialize();
 *   await pool.loadData(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);
 *
 *   const result = await pool.runValuation(
 *     {
 *       numScenarios: 10000,
 *       seed: 42,
 *       scenarioParams: DEFAULT_SCENARIO_PARAMS,
 *     },
 *     (progress) => console.log(`${progress}% complete`)
 *   );
 *
 *   console.log('Mean NPV:', result.statistics.meanNpv);
 *
 *   pool.terminate();
 * }
 * ```
 *
 * @packageDocumentation
 */

// Main engine class (single-threaded)
export { LiveCalcEngine, LiveCalcError } from './engine.js';

// CalcEngine interface for pluggable engines
export type {
  CalcEngine,
  CalcEngineFactory,
  AssumptionBuffers,
  ChunkConfig,
  ChunkResult,
  EngineInfo,
} from './calc-engine.js';

// LiveCalc WASM adapter
export {
  LiveCalcEngineAdapter,
  LiveCalcAdapterError,
  createLiveCalcEngineFactory,
} from './livecalc-adapter.js';
export type { LiveCalcAdapterConfig } from './livecalc-adapter.js';

// Mock engine for testing
export {
  MockCalcEngine,
  createMockEngineFactory,
  createFastMockEngine,
  createRealisticMockEngine,
  createFailingInitMockEngine,
  createFailingRunMockEngine,
} from './mock-engine.js';
export type { MockEngineConfig } from './mock-engine.js';

// Engine worker context
export {
  EngineWorkerContext,
} from './engine-worker.js';
export type {
  EngineWorkerMessage,
  EngineWorkerResponse,
  EngineWorkerInitMessage,
  EngineWorkerLoadDataMessage,
  EngineWorkerRunChunkMessage,
  EngineWorkerDisposeMessage,
  EngineWorkerInitCompleteResponse,
  EngineWorkerLoadCompleteResponse,
  EngineWorkerProgressResponse,
  EngineWorkerResultResponse,
  EngineWorkerErrorResponse,
  EngineWorkerDisposedResponse,
} from './engine-worker.js';

// Worker pool for parallel execution
export { WorkerPool, WorkerPoolError } from './worker-pool.js';
export type { WorkerPoolConfig } from './worker-pool.js';

// Node.js-specific worker pool
export {
  NodeWorkerPool,
  isNodeEnvironment,
  createWorkerPool,
} from './node-worker-pool.js';
export type { NodeWorkerPoolConfig } from './node-worker-pool.js';

// SharedArrayBuffer worker pool (zero-copy data sharing)
export {
  SABWorkerPool,
  NodeSABWorkerPool,
  createSABWorkerPool,
} from './sab-worker-pool.js';
export type { SABWorkerPoolConfig } from './sab-worker-pool.js';

// SharedArrayBuffer utilities
export {
  SharedBufferManager,
  SharedBufferReader,
  isSharedArrayBufferAvailable,
  calculateBufferSize,
} from './shared-buffer.js';
export type {
  SharedBufferAllocation,
  SharedBufferConfig,
} from './shared-buffer.js';

// Auto-selecting worker pool with fallback
export {
  createAutoWorkerPool,
  wouldUseSharedArrayBuffer,
} from './fallback.js';
export type {
  AutoWorkerPoolConfig,
  UnifiedWorkerPool,
} from './fallback.js';

// Work-stealing scheduler
export {
  WorkStealingDeque,
  WorkStealingDequePool,
  DequeResult,
  attachToDequePool,
} from './work-stealing-deque.js';

export {
  WorkStealingPool,
  NodeWorkStealingPool,
  createWorkStealingPool,
} from './work-stealing-pool.js';
export type {
  WorkStealingPoolConfig,
  WorkStealingWorkerMessage,
  WorkStealingWorkerResponse,
} from './work-stealing-pool.js';

// Adaptive pool with work-stealing fallback
export {
  createAdaptivePool,
  wouldUseWorkStealing,
  getAvailableModes,
} from './work-stealing-fallback.js';
export type {
  AdaptivePoolConfig,
  AdaptiveWorkerPool,
} from './work-stealing-fallback.js';

// Types
export type {
  // Core data types
  Policy,
  Gender,
  ProductType,
  MortalityTable,
  LapseTable,
  ExpenseAssumptions,

  // Configuration types
  ScenarioParams,
  ValuationConfig,
  MemoryConfig,

  // Result types
  ValuationResult,
  ValuationStatistics,
  Percentiles,

  // WASM module types (for advanced usage)
  LiveCalcWasmModule,
  CreateLiveCalcModule,

  // Worker message types (for custom worker implementations)
  WorkerMessage,
  WorkerResponse,
  WorkerProgressCallback,
} from './types.js';

// SIMD feature detection
export {
  isSimdSupported,
  clearSimdCache,
  getSimdSupportInfo,
  selectSimdModule,
  getSimdBrowserRequirements,
  SIMD_BROWSER_SUPPORT,
} from './simd-detection.js';
export type {
  SimdSupportInfo,
  SimdModuleConfig,
  SimdModuleSelection,
} from './simd-detection.js';

// Constants
export {
  DEFAULT_SCENARIO_PARAMS,
  DEFAULT_MEMORY_CONFIG,
  MEMORY_CONFIG_SMALL,
  MEMORY_CONFIG_LARGE,
} from './types.js';

// Pipeline Orchestrator
export {
  MemoryOffsetManager,
  MemoryAllocationError,
  parseBusResourceSize,
  // Atomic signals for node coordination
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
  // Pipeline error handling
  PipelineError,
  PipelineErrorHandler,
  PipelineErrorCode,
  createFailedResult,
  createSuccessResult,
  createEmptyNodeTiming,
} from './orchestrator/index.js';
export type {
  MemoryBlock,
  MemoryOffsetMap,
  MemoryOffsetMapJSON,
  MemoryManagerConfig,
  BusResourceRequirement,
  TypedArrayType,
  // Atomic signal types
  WaitResult,
  SignalTiming,
  MessageHandoffConfig,
  // Pipeline error types
  PipelineStage,
  PipelineErrorSeverity,
  PipelineErrorInfo,
  BusDataSnapshot,
  InputSnapshot,
  PipelineExecutionResult,
  NodeExecutionResult,
  NodeTiming,
} from './orchestrator/index.js';
