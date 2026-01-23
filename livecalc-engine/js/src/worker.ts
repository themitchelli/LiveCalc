/**
 * LiveCalc Worker - Worker script for processing valuation scenarios
 *
 * This script runs in a Web Worker (browser) or worker_threads (Node.js).
 * Each worker loads its own WASM instance and processes a subset of scenarios.
 */

import type {
  WorkerMessage,
  WorkerResponse,
  LiveCalcWasmModule,
  ScenarioParams,
} from './types.js';
import { SharedBufferReader } from './shared-buffer.js';

// Global state for this worker
let wasmModule: LiveCalcWasmModule | null = null;
let workerId: number = -1;
let dataLoaded = false;

// SharedArrayBuffer state
let sharedBufferReader: SharedBufferReader | null = null;
let sabWorkerId: number = -1;
let maxScenariosPerWorker: number = 0;
let sabDataLoaded = false;

/**
 * Post a message back to the main thread.
 */
function postResponse(response: WorkerResponse): void {
  // In browser context, 'self' is the worker global scope
  // In Node.js worker_threads, 'parentPort' is used
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.postMessage(response);
  }
}

/**
 * Post an error message.
 */
function postError(message: string): void {
  postResponse({ type: 'error', message });
}

/**
 * Post a progress update.
 */
function postProgress(percent: number): void {
  postResponse({ type: 'progress', percent });
}

/**
 * Get a Uint8Array view of WASM memory.
 */
function getHeapU8(): Uint8Array {
  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  if (wasmModule.HEAPU8) {
    return wasmModule.HEAPU8;
  }
  if (wasmModule.wasmMemory) {
    return new Uint8Array(wasmModule.wasmMemory.buffer);
  }
  throw new Error('Cannot access WASM memory');
}

/**
 * Get a Float64Array view of WASM memory.
 */
function getHeapF64(): Float64Array {
  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  if (wasmModule.HEAPF64) {
    return wasmModule.HEAPF64;
  }
  if (wasmModule.wasmMemory) {
    return new Float64Array(wasmModule.wasmMemory.buffer);
  }
  throw new Error('Cannot access WASM memory');
}

/**
 * Load CSV data into WASM memory and call a loader function.
 */
function loadCsvData(
  csvData: string,
  loaderFn: (ptr: number, size: number) => number
): number {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(csvData);

  const ptr = wasmModule!._livecalc_malloc(bytes.length);
  if (ptr === 0) {
    throw new Error('Failed to allocate WASM memory');
  }

  try {
    const heap = getHeapU8();
    heap.set(bytes, ptr);
    return loaderFn(ptr, bytes.length);
  } finally {
    wasmModule!._livecalc_free(ptr);
  }
}

/**
 * Handle initialization message.
 */
async function handleInit(wasmPath: string, id: number): Promise<void> {
  workerId = id;

  try {
    // Dynamic import of the WASM module
    // The wasmPath should point to the .mjs file that exports the factory
    const moduleFactory = await import(/* @vite-ignore */ wasmPath);
    const createModule =
      moduleFactory.default || moduleFactory.createLiveCalcModule;

    if (typeof createModule !== 'function') {
      throw new Error(
        'WASM module factory not found. Expected default export or createLiveCalcModule.'
      );
    }

    wasmModule = await createModule();
    postResponse({ type: 'init-complete' });
  } catch (error) {
    postError(
      `Failed to initialize WASM: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handle data loading message.
 */
function handleLoadData(
  policiesCsv: string,
  mortalityCsv: string,
  lapseCsv: string,
  expensesCsv: string
): void {
  if (!wasmModule) {
    postError('WASM module not initialized');
    return;
  }

  try {
    // Load policies
    const policyResult = loadCsvData(
      policiesCsv,
      wasmModule._load_policies_csv.bind(wasmModule)
    );
    if (policyResult < 0) {
      throw new Error('Failed to load policies');
    }

    // Load mortality
    const mortalityResult = loadCsvData(
      mortalityCsv,
      wasmModule._load_mortality_csv.bind(wasmModule)
    );
    if (mortalityResult < 0) {
      throw new Error('Failed to load mortality');
    }

    // Load lapse
    const lapseResult = loadCsvData(
      lapseCsv,
      wasmModule._load_lapse_csv.bind(wasmModule)
    );
    if (lapseResult < 0) {
      throw new Error('Failed to load lapse');
    }

    // Load expenses
    const expensesResult = loadCsvData(
      expensesCsv,
      wasmModule._load_expenses_csv.bind(wasmModule)
    );
    if (expensesResult < 0) {
      throw new Error('Failed to load expenses');
    }

    dataLoaded = true;
    postResponse({ type: 'load-complete' });
  } catch (error) {
    postError(
      `Failed to load data: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handle valuation execution message.
 */
function handleRunValuation(
  numScenarios: number,
  seed: number,
  scenarioParams: ScenarioParams,
  mortalityMultiplier: number,
  lapseMultiplier: number,
  expenseMultiplier: number,
  storeDistribution: boolean
): void {
  if (!wasmModule) {
    postError('WASM module not initialized');
    return;
  }

  if (!dataLoaded) {
    postError('Data not loaded');
    return;
  }

  try {
    const startTime = performance.now();

    // Report initial progress
    postProgress(0);

    // Run the valuation
    const result = wasmModule._run_valuation(
      numScenarios,
      BigInt(seed),
      scenarioParams.initialRate,
      scenarioParams.drift,
      scenarioParams.volatility,
      scenarioParams.minRate,
      scenarioParams.maxRate,
      mortalityMultiplier,
      lapseMultiplier,
      expenseMultiplier,
      storeDistribution ? 1 : 0
    );

    if (result < 0) {
      throw new Error('Valuation execution failed');
    }

    // Extract results
    const scenarioCount = wasmModule._get_result_scenario_count();
    let scenarioNpvs: number[] = [];

    if (storeDistribution && scenarioCount > 0) {
      // Allocate buffer for distribution
      const bufferSize = scenarioCount * 8;
      const ptr = wasmModule._livecalc_malloc(bufferSize);

      if (ptr !== 0) {
        try {
          const copied = wasmModule._get_result_distribution(ptr, scenarioCount);
          if (copied > 0) {
            const heap = getHeapF64();
            const floatIndex = ptr / 8;
            scenarioNpvs = Array.from({ length: copied }, (_, i) => heap[floatIndex + i]);
          }
        } finally {
          wasmModule._livecalc_free(ptr);
        }
      }
    }

    const endTime = performance.now();

    // Report completion
    postProgress(100);

    postResponse({
      type: 'result',
      scenarioNpvs,
      executionTimeMs: endTime - startTime,
    });
  } catch (error) {
    postError(
      `Valuation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handle attach SharedArrayBuffer message.
 */
function handleAttachSab(
  buffer: SharedArrayBuffer,
  id: number,
  maxScenarios: number
): void {
  if (!wasmModule) {
    postError('WASM module not initialized');
    return;
  }

  try {
    sharedBufferReader = new SharedBufferReader(buffer);
    sabWorkerId = id;
    maxScenariosPerWorker = maxScenarios;

    // Load data from SharedArrayBuffer into WASM
    // For now, we convert the binary data to CSV format that WASM can parse
    // In a more optimized version, we could load binary directly
    loadDataFromSab();

    sabDataLoaded = true;
    postResponse({ type: 'sab-attached' });
  } catch (error) {
    postError(
      `Failed to attach SharedArrayBuffer: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load data from SharedArrayBuffer into WASM memory.
 */
function loadDataFromSab(): void {
  if (!sharedBufferReader || !wasmModule) {
    throw new Error('SharedBuffer or WASM not initialized');
  }

  // Load policies from shared buffer
  const policiesView = sharedBufferReader.getPoliciesView();
  const policyCount = sharedBufferReader.policyCount;

  if (policyCount > 0) {
    const ptr = wasmModule._livecalc_malloc(policiesView.byteLength);
    if (ptr === 0) {
      throw new Error('Failed to allocate WASM memory for policies');
    }
    try {
      const heap = getHeapU8();
      heap.set(policiesView, ptr);
      const result = wasmModule._load_policies_binary(ptr, policiesView.byteLength);
      if (result < 0) {
        throw new Error('Failed to load policies from binary');
      }
    } finally {
      wasmModule._livecalc_free(ptr);
    }
  }

  // Load mortality from shared buffer
  const mortalityView = sharedBufferReader.getMortalityView();
  const mortalityBytes = new Uint8Array(mortalityView.buffer, mortalityView.byteOffset, mortalityView.byteLength);
  {
    const ptr = wasmModule._livecalc_malloc(mortalityBytes.byteLength);
    if (ptr === 0) {
      throw new Error('Failed to allocate WASM memory for mortality');
    }
    try {
      const heap = getHeapU8();
      heap.set(mortalityBytes, ptr);
      const result = wasmModule._load_mortality_binary(ptr, mortalityBytes.byteLength);
      if (result < 0) {
        throw new Error('Failed to load mortality from binary');
      }
    } finally {
      wasmModule._livecalc_free(ptr);
    }
  }

  // Load lapse from shared buffer
  const lapseView = sharedBufferReader.getLapseView();
  const lapseBytes = new Uint8Array(lapseView.buffer, lapseView.byteOffset, lapseView.byteLength);
  {
    const ptr = wasmModule._livecalc_malloc(lapseBytes.byteLength);
    if (ptr === 0) {
      throw new Error('Failed to allocate WASM memory for lapse');
    }
    try {
      const heap = getHeapU8();
      heap.set(lapseBytes, ptr);
      const result = wasmModule._load_lapse_binary(ptr, lapseBytes.byteLength);
      if (result < 0) {
        throw new Error('Failed to load lapse from binary');
      }
    } finally {
      wasmModule._livecalc_free(ptr);
    }
  }

  // Load expenses from shared buffer
  const expensesView = sharedBufferReader.getExpensesView();
  const expensesBytes = new Uint8Array(expensesView.buffer, expensesView.byteOffset, expensesView.byteLength);
  {
    const ptr = wasmModule._livecalc_malloc(expensesBytes.byteLength);
    if (ptr === 0) {
      throw new Error('Failed to allocate WASM memory for expenses');
    }
    try {
      const heap = getHeapU8();
      heap.set(expensesBytes, ptr);
      const result = wasmModule._load_expenses_binary(ptr, expensesBytes.byteLength);
      if (result < 0) {
        throw new Error('Failed to load expenses from binary');
      }
    } finally {
      wasmModule._livecalc_free(ptr);
    }
  }
}

/**
 * Handle valuation execution using SharedArrayBuffer.
 */
function handleRunValuationSab(
  numScenarios: number,
  seed: number,
  scenarioParams: ScenarioParams,
  mortalityMultiplier: number,
  lapseMultiplier: number,
  expenseMultiplier: number,
  workerId: number
): void {
  if (!wasmModule) {
    postError('WASM module not initialized');
    return;
  }

  if (!sabDataLoaded || !sharedBufferReader) {
    postError('SharedArrayBuffer data not loaded');
    return;
  }

  try {
    const startTime = performance.now();

    // Report initial progress
    postProgress(0);

    // Run the valuation
    const result = wasmModule._run_valuation(
      numScenarios,
      BigInt(seed),
      scenarioParams.initialRate,
      scenarioParams.drift,
      scenarioParams.volatility,
      scenarioParams.minRate,
      scenarioParams.maxRate,
      mortalityMultiplier,
      lapseMultiplier,
      expenseMultiplier,
      1 // Always store distribution for SAB mode
    );

    if (result < 0) {
      throw new Error('Valuation execution failed');
    }

    // Extract results and write to SharedArrayBuffer
    const scenarioCount = wasmModule._get_result_scenario_count();
    const resultsView = sharedBufferReader.getResultsView(workerId, maxScenariosPerWorker);

    if (scenarioCount > 0) {
      // Allocate buffer for distribution
      const bufferSize = scenarioCount * 8;
      const ptr = wasmModule._livecalc_malloc(bufferSize);

      if (ptr !== 0) {
        try {
          const copied = wasmModule._get_result_distribution(ptr, scenarioCount);
          if (copied > 0) {
            const heap = getHeapF64();
            const floatIndex = ptr / 8;
            // Copy results to SharedArrayBuffer
            for (let i = 0; i < copied; i++) {
              resultsView[i] = heap[floatIndex + i];
            }
          }
        } finally {
          wasmModule._livecalc_free(ptr);
        }
      }
    }

    const endTime = performance.now();

    // Report completion
    postProgress(100);

    postResponse({
      type: 'result-sab',
      scenarioCount,
      executionTimeMs: endTime - startTime,
    });
  } catch (error) {
    postError(
      `Valuation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Main message handler.
 */
function handleMessage(event: MessageEvent<WorkerMessage>): void {
  const message = event.data;

  switch (message.type) {
    case 'init':
      handleInit(message.wasmPath, message.workerId);
      break;

    case 'load-data':
      handleLoadData(
        message.policiesCsv,
        message.mortalityCsv,
        message.lapseCsv,
        message.expensesCsv
      );
      break;

    case 'run-valuation':
      handleRunValuation(
        message.numScenarios,
        message.seed,
        message.scenarioParams,
        message.mortalityMultiplier,
        message.lapseMultiplier,
        message.expenseMultiplier,
        message.storeDistribution
      );
      break;

    case 'attach-sab':
      handleAttachSab(
        message.buffer,
        message.workerId,
        message.maxScenariosPerWorker
      );
      break;

    case 'run-valuation-sab':
      handleRunValuationSab(
        message.numScenarios,
        message.seed,
        message.scenarioParams,
        message.mortalityMultiplier,
        message.lapseMultiplier,
        message.expenseMultiplier,
        message.workerId
      );
      break;

    default:
      postError(`Unknown message type: ${(message as WorkerMessage).type}`);
  }
}

// Set up message handler for browser Web Worker
if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', handleMessage);
}

// Export for Node.js worker_threads
export {
  handleMessage,
  handleInit,
  handleLoadData,
  handleRunValuation,
  handleAttachSab,
  handleRunValuationSab,
};
