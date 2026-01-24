/**
 * LiveCalcEngineAdapter - CalcEngine implementation for LiveCalc WASM engine
 *
 * This adapter wraps the LiveCalc WASM module and implements the CalcEngine
 * interface, allowing it to be used with the generic worker pool.
 */

import type {
  CalcEngine,
  AssumptionBuffers,
  ChunkConfig,
  ChunkResult,
  EngineInfo,
  CalcEngineFactory,
} from './calc-engine.js';
import type {
  LiveCalcWasmModule,
  CreateLiveCalcModule,
} from './types.js';

/**
 * Configuration for LiveCalcEngineAdapter.
 */
export interface LiveCalcAdapterConfig {
  /**
   * Factory function to create the WASM module.
   * This is the default export from livecalc.mjs.
   */
  createModule: CreateLiveCalcModule;
}

/**
 * Error class for LiveCalc adapter-specific errors.
 */
export class LiveCalcAdapterError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'LiveCalcAdapterError';
  }
}

/**
 * LiveCalcEngineAdapter wraps the LiveCalc WASM module and implements CalcEngine.
 *
 * ## Usage
 *
 * ```typescript
 * import createModule from './livecalc.mjs';
 *
 * const adapter = new LiveCalcEngineAdapter({ createModule });
 * await adapter.initialize();
 *
 * const count = await adapter.loadPolicies(policiesCsv);
 * await adapter.loadAssumptions({ mortality, lapse, expenses });
 *
 * const result = await adapter.runChunk({
 *   numScenarios: 1000,
 *   seed: 42,
 *   scenarioParams: DEFAULT_SCENARIO_PARAMS,
 * });
 *
 * console.log('NPVs:', result.scenarioNpvs);
 *
 * adapter.dispose();
 * ```
 */
export class LiveCalcEngineAdapter implements CalcEngine {
  private module: LiveCalcWasmModule | null = null;
  private initialized = false;
  private policiesLoaded = false;
  private assumptionsLoaded = false;
  private readonly createModule: CreateLiveCalcModule;

  constructor(config: LiveCalcAdapterConfig) {
    this.createModule = config.createModule;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new LiveCalcAdapterError(
        'Engine already initialized. Call dispose() first.',
        'ALREADY_INITIALIZED'
      );
    }

    try {
      this.module = await this.createModule();
      this.initialized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LiveCalcAdapterError(
        `Failed to initialize WASM module: ${message}`,
        'INIT_FAILED'
      );
    }
  }

  getInfo(): EngineInfo {
    return {
      name: 'LiveCalc WASM',
      version: this.getVersion(),
      maxPolicies: 1_000_000,
      maxScenariosPerChunk: 100_000,
      supportsBinaryInput: true,
    };
  }

  get isInitialized(): boolean {
    return this.initialized && this.module !== null;
  }

  get hasPolicies(): boolean {
    return this.policiesLoaded;
  }

  get hasAssumptions(): boolean {
    return this.assumptionsLoaded;
  }

  async loadPolicies(data: string | ArrayBuffer): Promise<number> {
    this.ensureInitialized();

    let result: number;

    if (typeof data === 'string') {
      result = this.loadCsvData(
        data,
        this.module!._load_policies_csv.bind(this.module)
      );
    } else {
      result = this.loadBinaryData(
        data,
        this.module!._load_policies_binary.bind(this.module)
      );
    }

    if (result < 0) {
      throw new LiveCalcAdapterError(
        'Failed to load policies. Check data format.',
        'LOAD_POLICIES_FAILED'
      );
    }

    this.policiesLoaded = true;
    return result;
  }

  async loadAssumptions(assumptions: AssumptionBuffers): Promise<void> {
    this.ensureInitialized();

    // Load mortality
    if (typeof assumptions.mortality === 'string') {
      const result = this.loadCsvData(
        assumptions.mortality,
        this.module!._load_mortality_csv.bind(this.module)
      );
      if (result < 0) {
        throw new LiveCalcAdapterError(
          'Failed to load mortality table.',
          'LOAD_MORTALITY_FAILED'
        );
      }
    } else {
      const result = this.loadBinaryData(
        assumptions.mortality,
        this.module!._load_mortality_binary.bind(this.module)
      );
      if (result < 0) {
        throw new LiveCalcAdapterError(
          'Failed to load mortality table (binary).',
          'LOAD_MORTALITY_FAILED'
        );
      }
    }

    // Load lapse
    if (typeof assumptions.lapse === 'string') {
      const result = this.loadCsvData(
        assumptions.lapse,
        this.module!._load_lapse_csv.bind(this.module)
      );
      if (result < 0) {
        throw new LiveCalcAdapterError(
          'Failed to load lapse table.',
          'LOAD_LAPSE_FAILED'
        );
      }
    } else {
      const result = this.loadBinaryData(
        assumptions.lapse,
        this.module!._load_lapse_binary.bind(this.module)
      );
      if (result < 0) {
        throw new LiveCalcAdapterError(
          'Failed to load lapse table (binary).',
          'LOAD_LAPSE_FAILED'
        );
      }
    }

    // Load expenses
    if (typeof assumptions.expenses === 'string') {
      const result = this.loadCsvData(
        assumptions.expenses,
        this.module!._load_expenses_csv.bind(this.module)
      );
      if (result < 0) {
        throw new LiveCalcAdapterError(
          'Failed to load expense assumptions.',
          'LOAD_EXPENSES_FAILED'
        );
      }
    } else {
      const result = this.loadBinaryData(
        assumptions.expenses,
        this.module!._load_expenses_binary.bind(this.module)
      );
      if (result < 0) {
        throw new LiveCalcAdapterError(
          'Failed to load expense assumptions (binary).',
          'LOAD_EXPENSES_FAILED'
        );
      }
    }

    this.assumptionsLoaded = true;
  }

  clearPolicies(): void {
    this.ensureInitialized();
    this.module!._clear_policies();
    this.policiesLoaded = false;
  }

  async runChunk(config: ChunkConfig): Promise<ChunkResult> {
    this.ensureInitialized();
    this.ensureDataLoaded();

    const {
      numScenarios,
      seed,
      scenarioParams,
      mortalityMultiplier = 1.0,
      lapseMultiplier = 1.0,
      expenseMultiplier = 1.0,
    } = config;

    if (numScenarios <= 0) {
      throw new LiveCalcAdapterError(
        'numScenarios must be positive',
        'INVALID_SCENARIOS'
      );
    }

    if (seed < 0) {
      throw new LiveCalcAdapterError(
        'seed must be non-negative',
        'INVALID_SEED'
      );
    }

    const startTime = performance.now();

    // Run valuation - always store distribution for chunk results
    const result = this.module!._run_valuation(
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
      1 // storeDistribution = true
    );

    if (result < 0) {
      throw new LiveCalcAdapterError(
        'Valuation execution failed.',
        'VALUATION_FAILED'
      );
    }

    // Extract scenario NPVs
    const scenarioCount = this.module!._get_result_scenario_count();
    const scenarioNpvs = this.extractDistribution(scenarioCount);

    const endTime = performance.now();

    return {
      scenarioNpvs,
      executionTimeMs: endTime - startTime,
    };
  }

  dispose(): void {
    if (this.module) {
      this.module._clear_policies();
      this.module = null;
      this.initialized = false;
      this.policiesLoaded = false;
      this.assumptionsLoaded = false;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private getVersion(): string {
    if (!this.module) {
      return '0.0.0';
    }
    try {
      const ptr = this.module._get_version();
      return this.module.UTF8ToString(ptr);
    } catch {
      return '0.0.0';
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.module) {
      throw new LiveCalcAdapterError(
        'Engine not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  private ensureDataLoaded(): void {
    if (!this.policiesLoaded) {
      throw new LiveCalcAdapterError(
        'Policies not loaded. Call loadPolicies() first.',
        'MISSING_POLICIES'
      );
    }
    if (!this.assumptionsLoaded) {
      throw new LiveCalcAdapterError(
        'Assumptions not loaded. Call loadAssumptions() first.',
        'MISSING_ASSUMPTIONS'
      );
    }
  }

  /**
   * Get a Uint8Array view of WASM memory.
   */
  private getHeapU8(): Uint8Array {
    if (this.module!.HEAPU8) {
      return this.module!.HEAPU8;
    }
    if (this.module!.wasmMemory) {
      return new Uint8Array(this.module!.wasmMemory.buffer);
    }
    throw new LiveCalcAdapterError(
      'Cannot access WASM memory.',
      'MEMORY_ACCESS_FAILED'
    );
  }

  /**
   * Get a Float64Array view of WASM memory.
   */
  private getHeapF64(): Float64Array {
    if (this.module!.HEAPF64) {
      return this.module!.HEAPF64;
    }
    if (this.module!.wasmMemory) {
      return new Float64Array(this.module!.wasmMemory.buffer);
    }
    throw new LiveCalcAdapterError(
      'Cannot access WASM memory.',
      'MEMORY_ACCESS_FAILED'
    );
  }

  /**
   * Load CSV data into WASM memory and call a loader function.
   */
  private loadCsvData(
    csvData: string,
    loaderFn: (ptr: number, size: number) => number
  ): number {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(csvData);

    const ptr = this.module!._livecalc_malloc(bytes.length);
    if (ptr === 0) {
      throw new LiveCalcAdapterError(
        'Failed to allocate WASM memory',
        'ALLOC_FAILED'
      );
    }

    try {
      const heap = this.getHeapU8();
      heap.set(bytes, ptr);
      return loaderFn(ptr, bytes.length);
    } finally {
      this.module!._livecalc_free(ptr);
    }
  }

  /**
   * Load binary data into WASM memory and call a loader function.
   */
  private loadBinaryData(
    data: ArrayBuffer,
    loaderFn: (ptr: number, size: number) => number
  ): number {
    const bytes = new Uint8Array(data);

    const ptr = this.module!._livecalc_malloc(bytes.length);
    if (ptr === 0) {
      throw new LiveCalcAdapterError(
        'Failed to allocate WASM memory',
        'ALLOC_FAILED'
      );
    }

    try {
      const heap = this.getHeapU8();
      heap.set(bytes, ptr);
      return loaderFn(ptr, bytes.length);
    } finally {
      this.module!._livecalc_free(ptr);
    }
  }

  /**
   * Extract distribution array from WASM memory.
   */
  private extractDistribution(count: number): Float64Array {
    if (count <= 0) {
      return new Float64Array(0);
    }

    const bufferSize = count * 8;
    const ptr = this.module!._livecalc_malloc(bufferSize);

    if (ptr === 0) {
      throw new LiveCalcAdapterError(
        'Failed to allocate buffer for distribution',
        'ALLOC_FAILED'
      );
    }

    try {
      const copied = this.module!._get_result_distribution(ptr, count);
      if (copied < 0) {
        throw new LiveCalcAdapterError(
          'Failed to copy distribution data',
          'COPY_FAILED'
        );
      }

      const heap = this.getHeapF64();
      const floatIndex = ptr / 8;
      const result = new Float64Array(copied);
      for (let i = 0; i < copied; i++) {
        result[i] = heap[floatIndex + i];
      }

      return result;
    } finally {
      this.module!._livecalc_free(ptr);
    }
  }
}

/**
 * Create a factory function for LiveCalcEngineAdapter.
 *
 * This is useful when you need to create multiple engine instances
 * (e.g., one per worker).
 *
 * @param createModule - The WASM module factory function
 * @returns A CalcEngineFactory that creates LiveCalcEngineAdapter instances
 *
 * @example
 * ```typescript
 * import createModule from './livecalc.mjs';
 *
 * const factory = createLiveCalcEngineFactory(createModule);
 * const engine1 = factory();
 * const engine2 = factory();
 *
 * await engine1.initialize();
 * await engine2.initialize();
 * ```
 */
export function createLiveCalcEngineFactory(
  createModule: CreateLiveCalcModule
): CalcEngineFactory {
  return () => new LiveCalcEngineAdapter({ createModule });
}
