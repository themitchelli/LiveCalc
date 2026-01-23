/**
 * LiveCalc Engine - JavaScript wrapper for WASM projection engine
 */

import type {
  Policy,
  MortalityTable,
  LapseTable,
  ExpenseAssumptions,
  ValuationConfig,
  ValuationResult,
  LiveCalcWasmModule,
  CreateLiveCalcModule,
  DEFAULT_SCENARIO_PARAMS,
} from './types.js';

/**
 * Error class for LiveCalc-specific errors
 */
export class LiveCalcError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'LiveCalcError';
  }
}

/**
 * LiveCalcEngine provides a clean JavaScript API for the WASM projection engine.
 *
 * @example
 * ```typescript
 * import { LiveCalcEngine } from '@livecalc/engine';
 * import createModule from './livecalc.mjs';
 *
 * const engine = new LiveCalcEngine();
 * await engine.initialize(createModule);
 *
 * engine.loadPoliciesFromCsv(policiesCsv);
 * engine.loadMortalityFromCsv(mortalityCsv);
 * engine.loadLapseFromCsv(lapseCsv);
 * engine.loadExpensesFromCsv(expensesCsv);
 *
 * const result = engine.runValuation({
 *   numScenarios: 1000,
 *   seed: 42,
 *   scenarioParams: { initialRate: 0.04, drift: 0, volatility: 0.02, minRate: 0, maxRate: 0.15 }
 * });
 *
 * console.log(result.statistics.meanNpv);
 *
 * engine.dispose();
 * ```
 */
export class LiveCalcEngine {
  private module: LiveCalcWasmModule | null = null;
  private initialized = false;
  private policiesLoaded = false;
  private mortalityLoaded = false;
  private lapseLoaded = false;
  private expensesLoaded = false;

  /**
   * Initialize the WASM module.
   *
   * @param createModule - Factory function from Emscripten-generated module
   * @throws LiveCalcError if initialization fails
   */
  async initialize(createModule: CreateLiveCalcModule): Promise<void> {
    if (this.initialized) {
      throw new LiveCalcError(
        'Engine already initialized. Call dispose() first to reinitialize.',
        'ALREADY_INITIALIZED'
      );
    }

    try {
      this.module = await createModule();
      this.initialized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LiveCalcError(
        `Failed to initialize WASM module: ${message}`,
        'INIT_FAILED'
      );
    }
  }

  /**
   * Check if the engine is initialized and ready.
   */
  get isInitialized(): boolean {
    return this.initialized && this.module !== null;
  }

  /**
   * Check if all required data is loaded for valuation.
   */
  get isReady(): boolean {
    return (
      this.isInitialized &&
      this.policiesLoaded &&
      this.mortalityLoaded &&
      this.lapseLoaded &&
      this.expensesLoaded
    );
  }

  /**
   * Get the engine version string.
   */
  getVersion(): string {
    this.ensureInitialized();
    const ptr = this.module!._get_version();
    return this.module!.UTF8ToString(ptr);
  }

  /**
   * Get the number of loaded policies.
   */
  getPolicyCount(): number {
    this.ensureInitialized();
    return this.module!._get_policy_count();
  }

  // ==========================================================================
  // Policy Loading
  // ==========================================================================

  /**
   * Load policies from a CSV string.
   *
   * Expected CSV format:
   * ```
   * policy_id,age,gender,sum_assured,premium,term,product_type
   * 1,35,M,100000,1200,20,TERM
   * ```
   *
   * @param csvData - CSV string containing policy data
   * @returns Number of policies loaded
   * @throws LiveCalcError if loading fails
   */
  loadPoliciesFromCsv(csvData: string): number {
    this.ensureInitialized();
    const result = this.loadCsvData(
      csvData,
      this.module!._load_policies_csv.bind(this.module)
    );

    if (result < 0) {
      throw new LiveCalcError(
        'Failed to load policies from CSV. Check CSV format.',
        'LOAD_POLICIES_FAILED'
      );
    }

    this.policiesLoaded = true;
    return result;
  }

  /**
   * Load policies from an array of Policy objects.
   *
   * Converts to CSV internally for WASM compatibility.
   *
   * @param policies - Array of Policy objects
   * @returns Number of policies loaded
   * @throws LiveCalcError if loading fails
   */
  loadPolicies(policies: Policy[]): number {
    if (policies.length === 0) {
      throw new LiveCalcError('Cannot load empty policy array', 'EMPTY_POLICIES');
    }

    const csv = this.policiesToCsv(policies);
    return this.loadPoliciesFromCsv(csv);
  }

  /**
   * Clear all loaded policies and free memory.
   */
  clearPolicies(): void {
    this.ensureInitialized();
    this.module!._clear_policies();
    this.policiesLoaded = false;
  }

  // ==========================================================================
  // Assumption Loading
  // ==========================================================================

  /**
   * Load mortality table from CSV string.
   *
   * Expected CSV format:
   * ```
   * age,qx_male,qx_female
   * 0,0.00234,0.00189
   * 1,0.00045,0.00037
   * ...
   * ```
   *
   * @param csvData - CSV string containing mortality rates
   * @throws LiveCalcError if loading fails
   */
  loadMortalityFromCsv(csvData: string): void {
    this.ensureInitialized();
    const result = this.loadCsvData(
      csvData,
      this.module!._load_mortality_csv.bind(this.module)
    );

    if (result < 0) {
      throw new LiveCalcError(
        'Failed to load mortality table from CSV. Check CSV format.',
        'LOAD_MORTALITY_FAILED'
      );
    }

    this.mortalityLoaded = true;
  }

  /**
   * Load mortality table from MortalityTable object.
   *
   * @param mortality - Mortality table with male and female qx arrays
   * @throws LiveCalcError if loading fails
   */
  loadMortality(mortality: MortalityTable): void {
    const csv = this.mortalityToCsv(mortality);
    this.loadMortalityFromCsv(csv);
  }

  /**
   * Load lapse table from CSV string.
   *
   * Expected CSV format:
   * ```
   * year,lapse_rate
   * 1,0.15
   * 2,0.10
   * ...
   * ```
   *
   * @param csvData - CSV string containing lapse rates
   * @throws LiveCalcError if loading fails
   */
  loadLapseFromCsv(csvData: string): void {
    this.ensureInitialized();
    const result = this.loadCsvData(
      csvData,
      this.module!._load_lapse_csv.bind(this.module)
    );

    if (result < 0) {
      throw new LiveCalcError(
        'Failed to load lapse table from CSV. Check CSV format.',
        'LOAD_LAPSE_FAILED'
      );
    }

    this.lapseLoaded = true;
  }

  /**
   * Load lapse table from array of rates by year.
   *
   * @param lapseRates - Array of lapse rates indexed by policy year (0 = year 1)
   * @throws LiveCalcError if loading fails
   */
  loadLapse(lapseRates: LapseTable): void {
    const csv = this.lapseToCsv(lapseRates);
    this.loadLapseFromCsv(csv);
  }

  /**
   * Load expense assumptions from CSV string.
   *
   * Expected CSV format:
   * ```
   * parameter,value
   * per_policy_acquisition,500
   * per_policy_maintenance,50
   * percent_of_premium,0.02
   * claim_expense,100
   * ```
   *
   * @param csvData - CSV string containing expense assumptions
   * @throws LiveCalcError if loading fails
   */
  loadExpensesFromCsv(csvData: string): void {
    this.ensureInitialized();
    const result = this.loadCsvData(
      csvData,
      this.module!._load_expenses_csv.bind(this.module)
    );

    if (result < 0) {
      throw new LiveCalcError(
        'Failed to load expense assumptions from CSV. Check CSV format.',
        'LOAD_EXPENSES_FAILED'
      );
    }

    this.expensesLoaded = true;
  }

  /**
   * Load expense assumptions from ExpenseAssumptions object.
   *
   * @param expenses - Expense assumptions object
   * @throws LiveCalcError if loading fails
   */
  loadExpenses(expenses: ExpenseAssumptions): void {
    const csv = this.expensesToCsv(expenses);
    this.loadExpensesFromCsv(csv);
  }

  // ==========================================================================
  // Valuation Execution
  // ==========================================================================

  /**
   * Run nested stochastic valuation.
   *
   * @param config - Valuation configuration
   * @returns Valuation result with statistics and optional distribution
   * @throws LiveCalcError if valuation fails or required data not loaded
   */
  runValuation(config: ValuationConfig): ValuationResult {
    this.ensureInitialized();
    this.ensureDataLoaded();

    const {
      numScenarios,
      seed,
      scenarioParams,
      mortalityMultiplier = 1.0,
      lapseMultiplier = 1.0,
      expenseMultiplier = 1.0,
      storeDistribution = false,
    } = config;

    // Validate inputs
    if (numScenarios <= 0) {
      throw new LiveCalcError(
        'numScenarios must be positive',
        'INVALID_SCENARIOS'
      );
    }

    if (seed < 0) {
      throw new LiveCalcError('seed must be non-negative', 'INVALID_SEED');
    }

    // Run valuation - note: seed is uint64_t so we pass as BigInt
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
      storeDistribution ? 1 : 0
    );

    if (result < 0) {
      throw new LiveCalcError(
        'Valuation execution failed. Check input data.',
        'VALUATION_FAILED'
      );
    }

    return this.extractResult(storeDistribution);
  }

  /**
   * Get the last valuation result as a JSON string.
   *
   * This is an alternative to extracting individual values,
   * useful for serialization or debugging.
   *
   * @returns JSON string of valuation result
   * @throws LiveCalcError if JSON generation fails
   */
  getResultJson(): string {
    this.ensureInitialized();

    const length = this.module!._generate_result_json();
    if (length < 0) {
      throw new LiveCalcError(
        'Failed to generate result JSON',
        'JSON_GENERATION_FAILED'
      );
    }

    const ptr = this.module!._get_result_json_ptr();
    return this.module!.UTF8ToString(ptr, length);
  }

  // ==========================================================================
  // Resource Management
  // ==========================================================================

  /**
   * Dispose of the engine and free all resources.
   *
   * After calling dispose(), the engine must be re-initialized
   * before use.
   */
  dispose(): void {
    if (this.module) {
      // Clear policies to free memory
      this.module._clear_policies();

      // Reset state
      this.module = null;
      this.initialized = false;
      this.policiesLoaded = false;
      this.mortalityLoaded = false;
      this.lapseLoaded = false;
      this.expensesLoaded = false;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.module) {
      throw new LiveCalcError(
        'Engine not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  private ensureDataLoaded(): void {
    const missing: string[] = [];

    if (!this.policiesLoaded) missing.push('policies');
    if (!this.mortalityLoaded) missing.push('mortality');
    if (!this.lapseLoaded) missing.push('lapse');
    if (!this.expensesLoaded) missing.push('expenses');

    if (missing.length > 0) {
      throw new LiveCalcError(
        `Missing required data: ${missing.join(', ')}. Load all data before running valuation.`,
        'MISSING_DATA'
      );
    }
  }

  /**
   * Get a Uint8Array view of WASM memory.
   * Handles both direct HEAPU8 access and wasmMemory.buffer access.
   */
  private getHeapU8(): Uint8Array {
    // Try direct HEAPU8 first (some builds expose this)
    if (this.module!.HEAPU8) {
      return this.module!.HEAPU8;
    }
    // Fall back to creating view from wasmMemory
    if (this.module!.wasmMemory) {
      return new Uint8Array(this.module!.wasmMemory.buffer);
    }
    throw new LiveCalcError(
      'Cannot access WASM memory. Module may not be properly initialized.',
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
    throw new LiveCalcError(
      'Cannot access WASM memory. Module may not be properly initialized.',
      'MEMORY_ACCESS_FAILED'
    );
  }

  /**
   * Helper to load CSV data into WASM memory and call loader function.
   */
  private loadCsvData(
    csvData: string,
    loaderFn: (ptr: number, size: number) => number
  ): number {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(csvData);

    // Allocate WASM memory
    const ptr = this.module!._livecalc_malloc(bytes.length);
    if (ptr === 0) {
      throw new LiveCalcError('Failed to allocate WASM memory', 'ALLOC_FAILED');
    }

    try {
      // Copy data to WASM memory
      const heap = this.getHeapU8();
      heap.set(bytes, ptr);

      // Call loader function
      return loaderFn(ptr, bytes.length);
    } finally {
      // Free allocated memory
      this.module!._livecalc_free(ptr);
    }
  }

  /**
   * Extract valuation result from WASM module.
   */
  private extractResult(includeDistribution: boolean): ValuationResult {
    const result: ValuationResult = {
      statistics: {
        meanNpv: this.module!._get_result_mean(),
        stdDev: this.module!._get_result_std_dev(),
        percentiles: {
          p50: this.module!._get_result_p50(),
          p75: this.module!._get_result_p75(),
          p90: this.module!._get_result_p90(),
          p95: this.module!._get_result_p95(),
          p99: this.module!._get_result_p99(),
        },
        cte95: this.module!._get_result_cte95(),
      },
      executionTimeMs: this.module!._get_result_execution_time_ms(),
      scenarioCount: this.module!._get_result_scenario_count(),
    };

    if (includeDistribution && result.scenarioCount > 0) {
      result.distribution = this.extractDistribution(result.scenarioCount);
    }

    return result;
  }

  /**
   * Extract distribution array from WASM memory.
   */
  private extractDistribution(count: number): number[] {
    // Allocate buffer for doubles (8 bytes each)
    const bufferSize = count * 8;
    const ptr = this.module!._livecalc_malloc(bufferSize);

    if (ptr === 0) {
      throw new LiveCalcError(
        'Failed to allocate buffer for distribution',
        'ALLOC_FAILED'
      );
    }

    try {
      const copied = this.module!._get_result_distribution(ptr, count);
      if (copied < 0) {
        throw new LiveCalcError(
          'Failed to copy distribution data',
          'COPY_FAILED'
        );
      }

      // Read doubles from WASM memory
      const heap = this.getHeapF64();
      const distribution: number[] = [];
      const floatIndex = ptr / 8; // HEAPF64 is indexed by doubles
      for (let i = 0; i < copied; i++) {
        distribution.push(heap[floatIndex + i]);
      }

      return distribution;
    } finally {
      this.module!._livecalc_free(ptr);
    }
  }

  // ==========================================================================
  // CSV Conversion Helpers
  // ==========================================================================

  private policiesToCsv(policies: Policy[]): string {
    const header = 'policy_id,age,gender,sum_assured,premium,term,product_type';
    const rows = policies.map(
      (p) =>
        `${p.policyId},${p.age},${p.gender},${p.sumAssured},${p.premium},${p.term},${p.productType}`
    );
    return [header, ...rows].join('\n');
  }

  private mortalityToCsv(mortality: MortalityTable): string {
    // Note: C++ reader expects columns: age, male_qx, female_qx (in that order)
    const header = 'age,male_qx,female_qx';
    const rows: string[] = [];

    const maxAge = Math.max(mortality.male.length, mortality.female.length);
    for (let age = 0; age < maxAge; age++) {
      const male = mortality.male[age] ?? 0;
      const female = mortality.female[age] ?? 0;
      rows.push(`${age},${male},${female}`);
    }

    return [header, ...rows].join('\n');
  }

  private lapseToCsv(lapseRates: LapseTable): string {
    const header = 'year,lapse_rate';
    const rows = lapseRates.map((rate, index) => `${index + 1},${rate}`);
    return [header, ...rows].join('\n');
  }

  private expensesToCsv(expenses: ExpenseAssumptions): string {
    return `parameter,value
per_policy_acquisition,${expenses.perPolicyAcquisition}
per_policy_maintenance,${expenses.perPolicyMaintenance}
percent_of_premium,${expenses.percentOfPremium}
claim_expense,${expenses.claimExpense}`;
  }
}
