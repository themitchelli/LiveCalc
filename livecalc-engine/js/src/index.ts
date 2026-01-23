/**
 * @livecalc/engine - JavaScript wrapper for LiveCalc WASM projection engine
 *
 * This package provides a clean TypeScript/JavaScript API for the LiveCalc
 * actuarial projection engine compiled to WebAssembly.
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
 * @packageDocumentation
 */

// Main engine class
export { LiveCalcEngine, LiveCalcError } from './engine.js';

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

  // Result types
  ValuationResult,
  ValuationStatistics,
  Percentiles,

  // WASM module types (for advanced usage)
  LiveCalcWasmModule,
  CreateLiveCalcModule,
} from './types.js';

// Constants
export { DEFAULT_SCENARIO_PARAMS } from './types.js';
