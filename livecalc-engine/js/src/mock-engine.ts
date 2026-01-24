/**
 * MockCalcEngine - Mock implementation of CalcEngine for testing
 *
 * This mock engine generates deterministic results without requiring
 * the real WASM module. It's useful for:
 * - Testing the scheduler and worker pool
 * - Benchmarking worker communication overhead
 * - Unit testing without WASM dependencies
 * - Development when WASM build is not available
 */

import type {
  CalcEngine,
  AssumptionBuffers,
  ChunkConfig,
  ChunkResult,
  EngineInfo,
  CalcEngineFactory,
} from './calc-engine.js';

/**
 * Configuration for MockCalcEngine behavior.
 */
export interface MockEngineConfig {
  /**
   * Simulated processing time per scenario in milliseconds.
   * @default 0 (instant)
   */
  msPerScenario?: number;

  /**
   * Mean NPV to generate (used as base for deterministic results).
   * @default 1000000
   */
  baseMeanNpv?: number;

  /**
   * Standard deviation for generated NPVs.
   * @default 100000
   */
  stdDev?: number;

  /**
   * Whether to throw an error during initialization.
   * @default false
   */
  failOnInit?: boolean;

  /**
   * Whether to throw an error during runChunk.
   * @default false
   */
  failOnRun?: boolean;

  /**
   * Custom error message for failures.
   */
  errorMessage?: string;
}

/**
 * Simple seedable random number generator (Mulberry32).
 * Produces deterministic results for reproducible tests.
 */
function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Generate a normally distributed random number using Box-Muller transform.
 */
function normalRandom(random: () => number, mean: number, stdDev: number): number {
  const u1 = random();
  const u2 = random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * MockCalcEngine provides a test double for CalcEngine.
 *
 * ## Features
 *
 * - Deterministic results based on seed
 * - Configurable simulated processing time
 * - Configurable failure modes for error testing
 * - No WASM dependencies
 *
 * ## Usage
 *
 * ```typescript
 * const engine = new MockCalcEngine({
 *   msPerScenario: 0.1,  // Simulate 0.1ms per scenario
 *   baseMeanNpv: 1000000,
 *   stdDev: 50000,
 * });
 *
 * await engine.initialize();
 * await engine.loadPolicies('dummy data');
 * await engine.loadAssumptions({ mortality: '', lapse: '', expenses: '' });
 *
 * const result = await engine.runChunk({
 *   numScenarios: 1000,
 *   seed: 42,
 *   scenarioParams: DEFAULT_SCENARIO_PARAMS,
 * });
 *
 * // Results are deterministic based on seed
 * console.log(result.scenarioNpvs[0]);  // Always the same for seed 42
 * ```
 */
export class MockCalcEngine implements CalcEngine {
  private initialized = false;
  private policiesLoaded = false;
  private assumptionsLoaded = false;
  private policyCount = 0;

  private readonly config: Required<MockEngineConfig>;

  constructor(config: MockEngineConfig = {}) {
    this.config = {
      msPerScenario: config.msPerScenario ?? 0,
      baseMeanNpv: config.baseMeanNpv ?? 1_000_000,
      stdDev: config.stdDev ?? 100_000,
      failOnInit: config.failOnInit ?? false,
      failOnRun: config.failOnRun ?? false,
      errorMessage: config.errorMessage ?? 'Mock engine failure',
    };
  }

  async initialize(): Promise<void> {
    if (this.config.failOnInit) {
      throw new Error(this.config.errorMessage);
    }

    // Simulate async initialization
    await new Promise(resolve => setTimeout(resolve, 1));

    this.initialized = true;
  }

  getInfo(): EngineInfo {
    return {
      name: 'MockCalcEngine',
      version: '1.0.0',
      maxPolicies: 10_000_000,
      maxScenariosPerChunk: 1_000_000,
      supportsBinaryInput: true,
    };
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get hasPolicies(): boolean {
    return this.policiesLoaded;
  }

  get hasAssumptions(): boolean {
    return this.assumptionsLoaded;
  }

  async loadPolicies(data: string | ArrayBuffer): Promise<number> {
    if (!this.initialized) {
      throw new Error('Engine not initialized');
    }

    // Simulate policy loading - count lines for CSV or estimate from bytes
    if (typeof data === 'string') {
      // Count non-empty lines (excluding header)
      const lines = data.split('\n').filter(line => line.trim().length > 0);
      this.policyCount = Math.max(0, lines.length - 1); // Subtract header
    } else {
      // Estimate from binary (32 bytes per policy)
      this.policyCount = Math.floor(data.byteLength / 32);
    }

    // If no data, create a default count for testing
    if (this.policyCount === 0) {
      this.policyCount = 1000;
    }

    this.policiesLoaded = true;
    return this.policyCount;
  }

  async loadAssumptions(_assumptions: AssumptionBuffers): Promise<void> {
    if (!this.initialized) {
      throw new Error('Engine not initialized');
    }

    // Mock just stores the flag
    this.assumptionsLoaded = true;
  }

  clearPolicies(): void {
    this.policiesLoaded = false;
    this.policyCount = 0;
  }

  async runChunk(config: ChunkConfig): Promise<ChunkResult> {
    if (!this.initialized) {
      throw new Error('Engine not initialized');
    }

    if (!this.policiesLoaded) {
      throw new Error('Policies not loaded');
    }

    if (!this.assumptionsLoaded) {
      throw new Error('Assumptions not loaded');
    }

    if (this.config.failOnRun) {
      throw new Error(this.config.errorMessage);
    }

    const { numScenarios, seed, mortalityMultiplier = 1.0 } = config;

    const startTime = performance.now();

    // Simulate processing time if configured
    const simulatedTime = numScenarios * this.config.msPerScenario;
    if (simulatedTime > 0) {
      await new Promise(resolve => setTimeout(resolve, simulatedTime));
    }

    // Generate deterministic results based on seed
    const random = mulberry32(seed);
    const scenarioNpvs = new Float64Array(numScenarios);

    // Adjust mean based on mortality multiplier (higher mortality = lower NPV)
    const adjustedMean = this.config.baseMeanNpv * (2 - mortalityMultiplier);

    for (let i = 0; i < numScenarios; i++) {
      // Generate scenario-specific variation
      scenarioNpvs[i] = normalRandom(random, adjustedMean, this.config.stdDev);
    }

    const endTime = performance.now();

    return {
      scenarioNpvs,
      executionTimeMs: endTime - startTime,
    };
  }

  dispose(): void {
    this.initialized = false;
    this.policiesLoaded = false;
    this.assumptionsLoaded = false;
    this.policyCount = 0;
  }
}

/**
 * Create a factory function for MockCalcEngine.
 *
 * @param config - Configuration for the mock engine
 * @returns A CalcEngineFactory that creates MockCalcEngine instances
 *
 * @example
 * ```typescript
 * const factory = createMockEngineFactory({
 *   msPerScenario: 0.01,  // Very fast for unit tests
 * });
 *
 * const engine = factory();
 * await engine.initialize();
 * ```
 */
export function createMockEngineFactory(
  config: MockEngineConfig = {}
): CalcEngineFactory {
  return () => new MockCalcEngine(config);
}

/**
 * Create a MockCalcEngine configured for fast unit tests.
 * No simulated delay, instant results.
 */
export function createFastMockEngine(): CalcEngine {
  return new MockCalcEngine({
    msPerScenario: 0,
    baseMeanNpv: 1_000_000,
    stdDev: 100_000,
  });
}

/**
 * Create a MockCalcEngine configured for realistic performance testing.
 * Simulates ~10M projections/second.
 */
export function createRealisticMockEngine(): CalcEngine {
  return new MockCalcEngine({
    msPerScenario: 0.0001,  // 0.1μs per scenario = 10M/s
    baseMeanNpv: 1_000_000,
    stdDev: 100_000,
  });
}

/**
 * Create a MockCalcEngine that fails on initialization.
 * Useful for testing error handling.
 */
export function createFailingInitMockEngine(errorMessage?: string): CalcEngine {
  return new MockCalcEngine({
    failOnInit: true,
    errorMessage: errorMessage ?? 'Mock initialization failure',
  });
}

/**
 * Create a MockCalcEngine that fails on runChunk.
 * Useful for testing error handling.
 */
export function createFailingRunMockEngine(errorMessage?: string): CalcEngine {
  return new MockCalcEngine({
    failOnRun: true,
    errorMessage: errorMessage ?? 'Mock computation failure',
  });
}
