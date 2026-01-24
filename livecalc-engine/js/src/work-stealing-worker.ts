/**
 * Work-Stealing Worker - Worker script for work-stealing scheduler
 *
 * This worker script implements the work-stealing algorithm:
 * 1. Process tasks from own deque (LIFO for cache locality)
 * 2. When local deque is empty, steal from random victims (FIFO)
 * 3. Continue until all workers are idle and all deques are empty
 *
 * @module work-stealing-worker
 */

import type {
  LiveCalcWasmModule,
  ScenarioParams,
} from './types.js';
import {
  WorkStealingDeque,
  DequeResult,
  attachToDequePool,
} from './work-stealing-deque.js';
import { SharedBufferReader } from './shared-buffer.js';
import type {
  WorkStealingWorkerMessage,
  WorkStealingWorkerResponse,
  WorkStealingWorkerRunMessage,
} from './work-stealing-pool.js';

// Worker state
let workerId: number = -1;
let wasmModule: LiveCalcWasmModule | null = null;
let dataReader: SharedBufferReader | null = null;
let ownDeque: WorkStealingDeque | null = null;
let victimDeques: WorkStealingDeque[] = [];
let resultsBuffer: SharedArrayBuffer | null = null;
let resultsView: Float64Array | null = null;
let workerCount: number = 0;

// Statistics
let tasksCompleted = 0;
let tasksStolen = 0;
let scenariosComputed = 0;

/**
 * Handle incoming messages from main thread
 */
function handleMessage(event: MessageEvent<WorkStealingWorkerMessage>): void {
  const message = event.data;

  switch (message.type) {
    case 'ws-init':
      handleInit(message);
      break;
    case 'ws-attach':
      handleAttach(message);
      break;
    case 'ws-run':
      handleRun(message);
      break;
  }
}

/**
 * Initialize WASM module
 */
async function handleInit(message: { wasmPath: string; workerId: number }): Promise<void> {
  try {
    workerId = message.workerId;

    // Dynamic import of WASM module
    const createModule = (await import(message.wasmPath)).default;
    wasmModule = await createModule();

    postResponse({ type: 'ws-init-complete' });
  } catch (error) {
    postResponse({
      type: 'ws-error',
      message: `Worker ${workerId} init failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Attach shared buffers
 */
function handleAttach(message: {
  dataBuffer: SharedArrayBuffer;
  dequeBuffer: SharedArrayBuffer;
  resultsBuffer: SharedArrayBuffer;
  workerId: number;
  workerCount: number;
  dequeCapacity: number;
  maxScenariosPerTask: number;
}): void {
  try {
    // Attach data buffer
    dataReader = new SharedBufferReader(message.dataBuffer);

    // Attach deque pool
    const poolConfig = attachToDequePool(message.dequeBuffer);
    workerCount = poolConfig.workerCount;

    // Create own deque (as owner)
    const dequeSize = 8 + poolConfig.dequeCapacity * 4; // header + tasks
    const ownDequeOffset = poolConfig.headerSize + workerId * dequeSize;
    ownDeque = new WorkStealingDeque(
      message.dequeBuffer,
      ownDequeOffset,
      poolConfig.dequeCapacity,
      true // isOwner
    );

    // Create victim deques (as thief)
    victimDeques = [];
    for (let i = 0; i < workerCount; i++) {
      if (i !== workerId) {
        const victimOffset = poolConfig.headerSize + i * dequeSize;
        victimDeques.push(
          new WorkStealingDeque(
            message.dequeBuffer,
            victimOffset,
            poolConfig.dequeCapacity,
            false // isOwner = false (thief)
          )
        );
      }
    }

    // Attach results buffer
    resultsBuffer = message.resultsBuffer;
    resultsView = new Float64Array(resultsBuffer);

    postResponse({ type: 'ws-attach-complete' });
  } catch (error) {
    postResponse({
      type: 'ws-error',
      message: `Worker ${workerId} attach failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Run work-stealing valuation
 */
async function handleRun(message: WorkStealingWorkerRunMessage): Promise<void> {
  if (!wasmModule || !dataReader || !ownDeque || !resultsView) {
    postResponse({
      type: 'ws-error',
      message: `Worker ${workerId} not ready`,
    });
    return;
  }

  const startTime = performance.now();

  // Reset statistics
  tasksCompleted = 0;
  tasksStolen = 0;
  scenariosComputed = 0;

  try {
    // Load data into WASM (if not already loaded)
    // The data is shared via SharedArrayBuffer, but we need to copy it to WASM memory
    // For efficiency, we could use binary loading if the engine supports it

    const policyCount = dataReader.policyCount;
    if (policyCount > 0) {
      // For now, we'll use the simpler approach of loading from the shared buffer
      // In a production implementation, we'd want to optimize this
      loadDataIntoWasm(dataReader);
    }

    // Work-stealing loop
    let emptyAttempts = 0;
    const maxEmptyAttempts = workerCount * 2; // Try each victim twice before giving up

    while (true) {
      // Try to get a task from own deque (local work)
      let task = ownDeque.pop();

      if (task.result === DequeResult.SUCCESS) {
        // Process local task
        processTask(task.taskId, message);
        emptyAttempts = 0;
        continue;
      }

      // Own deque is empty, try to steal from a random victim
      const stolen = tryStealFromRandomVictim();

      if (stolen !== null) {
        // Process stolen task
        processTask(stolen, message);
        tasksStolen++;
        emptyAttempts = 0;
        continue;
      }

      // Couldn't steal anything
      emptyAttempts++;

      if (emptyAttempts >= maxEmptyAttempts) {
        // All deques appear to be empty, we're done
        break;
      }

      // Brief yield to allow other workers to make progress
      // This prevents spinning when there's genuine work in progress elsewhere
      await yieldToEventLoop();
    }

    const endTime = performance.now();

    postResponse({
      type: 'ws-result',
      scenariosComputed,
      executionTimeMs: endTime - startTime,
      tasksCompleted,
      tasksStolen,
    });
  } catch (error) {
    postResponse({
      type: 'ws-error',
      message: `Worker ${workerId} run failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Try to steal a task from a random victim
 */
function tryStealFromRandomVictim(): number | null {
  if (victimDeques.length === 0) {
    return null;
  }

  // Random starting point for fairness
  const startIdx = Math.floor(Math.random() * victimDeques.length);

  // Try all victims in random order
  for (let i = 0; i < victimDeques.length; i++) {
    const victimIdx = (startIdx + i) % victimDeques.length;
    const victim = victimDeques[victimIdx];

    const stolen = victim.steal();
    if (stolen.result === DequeResult.SUCCESS) {
      return stolen.taskId;
    }

    // If ABORT (contention), try next victim
    // If EMPTY, continue to next victim
  }

  return null;
}

/**
 * Process a single task
 */
function processTask(encodedTask: number, config: WorkStealingWorkerRunMessage): void {
  // Decode task: (scenarioStart << 16) | count
  const scenarioStart = encodedTask >>> 16;
  const count = encodedTask & 0xFFFF;

  // Run valuation for this chunk of scenarios
  const chunkResult = runValuationChunk(
    scenarioStart,
    count,
    config.seed + scenarioStart, // Unique seed based on scenario range
    config.scenarioParams,
    config.mortalityMultiplier,
    config.lapseMultiplier,
    config.expenseMultiplier
  );

  // Write results to shared buffer
  if (resultsView) {
    for (let i = 0; i < chunkResult.length; i++) {
      resultsView[scenarioStart + i] = chunkResult[i];
    }
  }

  tasksCompleted++;
  scenariosComputed += count;

  // Report progress periodically
  if (tasksCompleted % 5 === 0) {
    postResponse({
      type: 'ws-progress',
      tasksCompleted,
      tasksStolen,
    });
  }
}

/**
 * Load data into WASM from SharedBufferReader
 */
function loadDataIntoWasm(reader: SharedBufferReader): void {
  if (!wasmModule) return;

  // Get views into shared buffer
  const policiesView = reader.getPoliciesView();
  const mortalityView = reader.getMortalityView();
  const lapseView = reader.getLapseView();
  const expensesView = reader.getExpensesView();

  // Load policies (binary format)
  const policyPtr = wasmModule._livecalc_malloc(policiesView.byteLength);
  if (!wasmModule.HEAPU8) {
    throw new Error('WASM HEAPU8 not available');
  }
  wasmModule.HEAPU8.set(policiesView, policyPtr);
  wasmModule._load_policies_binary(policyPtr, reader.policyCount);
  wasmModule._livecalc_free(policyPtr);

  // Load mortality (binary format - convert Float64 to expected format)
  // The binary format expects 121 * 2 doubles
  const mortalityPtr = wasmModule._livecalc_malloc(mortalityView.byteLength);
  const mortalityBytes = new Uint8Array(mortalityView.buffer, mortalityView.byteOffset, mortalityView.byteLength);
  wasmModule.HEAPU8.set(mortalityBytes, mortalityPtr);
  wasmModule._load_mortality_binary(mortalityPtr, mortalityView.length);
  wasmModule._livecalc_free(mortalityPtr);

  // Load lapse (binary format)
  const lapsePtr = wasmModule._livecalc_malloc(lapseView.byteLength);
  const lapseBytes = new Uint8Array(lapseView.buffer, lapseView.byteOffset, lapseView.byteLength);
  wasmModule.HEAPU8.set(lapseBytes, lapsePtr);
  wasmModule._load_lapse_binary(lapsePtr, lapseView.length);
  wasmModule._livecalc_free(lapsePtr);

  // Load expenses (binary format)
  const expensePtr = wasmModule._livecalc_malloc(expensesView.byteLength);
  const expenseBytes = new Uint8Array(expensesView.buffer, expensesView.byteOffset, expensesView.byteLength);
  wasmModule.HEAPU8.set(expenseBytes, expensePtr);
  wasmModule._load_expenses_binary(expensePtr, expensesView.length);
  wasmModule._livecalc_free(expensePtr);
}

/**
 * Run valuation for a chunk of scenarios
 */
function runValuationChunk(
  scenarioStart: number,
  numScenarios: number,
  seed: number,
  params: ScenarioParams,
  mortalityMult: number,
  lapseMult: number,
  expenseMult: number
): Float64Array {
  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  // Run valuation
  wasmModule._run_valuation(
    numScenarios,
    BigInt(seed),
    params.initialRate,
    params.drift,
    params.volatility,
    params.minRate,
    params.maxRate,
    mortalityMult,
    lapseMult,
    expenseMult,
    1 // storeDistribution = true
  );

  // Extract results
  const results = new Float64Array(numScenarios);
  for (let i = 0; i < numScenarios; i++) {
    results[i] = wasmModule._get_result_scenario_npv(i);
  }

  return results;
}

/**
 * Yield to event loop (allows other async operations to proceed)
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Post a response message to main thread
 */
function postResponse(response: WorkStealingWorkerResponse): void {
  (self as unknown as { postMessage: (msg: unknown) => void }).postMessage(response);
}

// Set up message handler
self.onmessage = handleMessage;
