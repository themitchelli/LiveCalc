<!-- FADE progress.md v0.3.1 -->

# Progress Log

Session history for this project. Append-only.

<!--
Entry format (append new entries below the line):

## YYYY-MM-DD HH:MM - US-XXX: Story Title - COMPLETE

- Summary of what was implemented
- Files changed: list key files
- Tests: passed/added

For blocked stories, use:

## YYYY-MM-DD HH:MM - US-XXX: Story Title - BLOCKED

- What was attempted
- What's blocking progress
- Suggested resolution
-->

---

## 2026-01-23 20:30 - US-001: Policy Data Structure - COMPLETE

- Implemented Policy struct with all required fields (policy_id, age, gender, sum_assured, premium, term, product_type)
- Created PolicySet container supporting 100,000+ policies
- Implemented CSV loading with flexible gender/product_type parsing
- Implemented binary serialization/deserialization for WASM deployment
- Documented memory footprint: 24 bytes serialized, 32 bytes in-memory per policy
- Files changed:
  - livecalc-engine/CMakeLists.txt (build configuration with Catch2)
  - livecalc-engine/src/policy.hpp, policy.cpp
  - livecalc-engine/src/io/csv_reader.hpp, csv_reader.cpp
  - livecalc-engine/src/main.cpp
  - livecalc-engine/tests/test_policy.cpp
  - livecalc-engine/data/sample_policies.csv
  - livecalc-engine/README.md
- Tests: 12 tests passed (struct fields, equality, serialization round-trip, 100K capacity, CSV loading, memory footprint)

## 2026-01-23 21:15 - US-002: Assumption Tables - COMPLETE

- Implemented MortalityTable class with qx rates by age (0-120) and gender
- Implemented LapseTable class with lapse rates by policy year (1-50)
- Implemented ExpenseAssumptions struct with per-policy acquisition, maintenance, percent-of-premium, and claim expenses
- All tables support CSV loading and binary serialization for WASM deployment
- Added assumption multiplier support to stress-test results (with automatic 1.0 capping for probabilities)
- Documented memory footprint: MortalityTable 1,936 bytes, LapseTable 400 bytes, ExpenseAssumptions 32 bytes
- Files changed:
  - livecalc-engine/src/assumptions.hpp, assumptions.cpp (new)
  - livecalc-engine/tests/test_assumptions.cpp (new)
  - livecalc-engine/data/sample_mortality.csv (new)
  - livecalc-engine/data/sample_lapse.csv (new)
  - livecalc-engine/data/sample_expenses.csv (new)
  - livecalc-engine/CMakeLists.txt (added new sources)
  - livecalc-engine/README.md (documented assumption tables)
- Tests: 32 new tests added (44 total), covering boundary lookups (age 0/120, year 1/50), multipliers, CSV loading, serialization round-trips

## 2026-01-23 22:00 - US-003: Economic Scenario Structure - COMPLETE

- Implemented Scenario class with interest rates by year (1-50) and discount factor calculation
- Implemented ScenarioSet container supporting 10,000+ scenarios for nested stochastic valuation
- Implemented Geometric Brownian Motion scenario generator with configurable parameters (initial rate, drift, volatility, min/max bounds)
- Added seed-based reproducibility for deterministic scenario generation
- Implemented CSV loading in both wide (one row per scenario) and long (one row per year) formats
- Implemented binary serialization/deserialization for WASM deployment
- Documented memory footprint: 400 bytes per scenario (50 years × 8 bytes)
- Files changed:
  - livecalc-engine/src/scenario.hpp, scenario.cpp (new)
  - livecalc-engine/tests/test_scenario.cpp (new)
  - livecalc-engine/data/sample_scenarios.csv (new)
  - livecalc-engine/CMakeLists.txt (added new sources)
  - livecalc-engine/README.md (documented economic scenarios)
- Tests: 31 new tests added (75 total), covering boundary years (1/50), discount factors, GBM generation, seed reproducibility, distribution validation, CSV loading, serialization round-trips

## 2026-01-23 20:34 - US-004: Single Policy Projection - COMPLETE

- Implemented project_policy() function that projects a single policy under a single scenario
- Created ProjectionResult struct with NPV and optional detailed cash flow vector
- Created YearlyCashFlow struct with year-by-year breakdown (lives, premium, deaths, lapses, expenses, discounting)
- Created ProjectionConfig struct with detailed_cashflows flag and multipliers for mortality/lapse/expenses
- Projection logic:
  - Starts with 1.0 lives at beginning of year 1
  - Applies mortality decrements (qx × lives × sum_assured)
  - Applies lapse decrements on survivors (currently 0 surrender value for term products)
  - Calculates expenses (first year includes acquisition, all years include maintenance + % premium + claim expense)
  - Discounts cash flows using cumulative scenario discount factors
- Edge case handling: age capping at 120, term capping at 50, zero-term returns 0, early exit when lives depleted
- Hand-calculated validation test verifies results within 0.01% tolerance
- Files changed:
  - livecalc-engine/src/projection.hpp, projection.cpp (new)
  - livecalc-engine/tests/test_projection.cpp (new)
  - livecalc-engine/CMakeLists.txt (added new sources)
  - livecalc-engine/README.md (documented projection module)
- Tests: 21 new tests added (96 total), covering edge cases (age 0/120, term 1/50), hand-calculated validation, multipliers, gender-specific mortality, variable interest rates, NPV consistency

## 2026-01-23 23:45 - US-005: Nested Stochastic Valuation - COMPLETE

- Implemented run_valuation() function with outer loop (scenarios) and inner loop (policies)
- Created ValuationResult struct with summary statistics (mean, std_dev, percentiles, CTE_95, execution_time_ms)
- Created ValuationConfig struct with store_scenario_npvs flag and multipliers for mortality/lapse/expenses
- Statistics implementation:
  - Mean: arithmetic mean of scenario NPVs
  - Std Dev: population standard deviation
  - Percentiles: P50, P75, P90, P95, P99 using linear interpolation
  - CTE_95: average of worst 5% of scenarios (lower tail)
- Performance benchmark results:
  - 10K policies × 1K scenarios: 2.5 seconds (target: <30 seconds) ✓
  - 100K policies × 1K scenarios: 25 seconds
  - Throughput: ~4 million projections/second
- Files changed:
  - livecalc-engine/src/valuation.hpp, valuation.cpp (new)
  - livecalc-engine/tests/test_valuation.cpp (new)
  - livecalc-engine/tests/benchmark_valuation.cpp (new)
  - livecalc-engine/CMakeLists.txt (added new sources and benchmark target)
  - livecalc-engine/README.md (documented valuation module)
- Tests: 25 new tests added (121 total), covering edge cases (empty scenarios/policies), aggregation correctness, statistics validation, CTE calculation, multipliers, seed reproducibility, scale tests (1K×100, 100×100)

## 2026-01-23 - US-006: Command Line Interface - COMPLETE

- Implemented full CLI argument parsing with required and optional flags
- Created JSON output writer for ValuationResult with statistics and distribution
- Added comprehensive input validation with clear error messages
- CLI supports all required flags: --policies, --mortality, --lapse, --expenses, --scenarios, --seed, --output
- CLI supports scenario generation parameters: --initial-rate, --drift, --volatility, --min-rate, --max-rate
- CLI supports stress testing multipliers: --mortality-mult, --lapse-mult, --expense-mult
- JSON output includes statistics (mean, std_dev, percentiles, cte_95), execution_time_ms, scenario_count, distribution
- Execution time printed to stderr for visibility
- Files changed:
  - livecalc-engine/src/main.cpp (full CLI implementation)
  - livecalc-engine/src/io/json_writer.hpp, json_writer.cpp (new)
  - livecalc-engine/tests/test_cli.cpp (new - 11 integration tests)
  - livecalc-engine/CMakeLists.txt (added json_writer.cpp, cli_tests target)
  - livecalc-engine/README.md (documented CLI usage with examples)
- Tests: 11 new tests added (132 total), covering help display, argument validation, file path validation, full valuation execution, JSON output to file, seed reproducibility, multipliers effect, scenario generation parameters, validation errors

## 2026-01-23 23:15 - US-001: Emscripten Build Configuration (PRD-LC-002) - COMPLETE

- Configured CMakeLists.txt to support both native and Emscripten builds via toolchain file detection
- Created WASM exports file (src/wasm/exports.cpp) with C-compatible interface for JavaScript interop
- Exported functions: load_policies_csv, load_mortality_csv, load_lapse_csv, load_expenses_csv, run_valuation, get_result_* accessors, generate_result_json
- Build produces livecalc.mjs (ES6 module) + livecalc.wasm
- Release build optimized with -O3 and -flto flags (100KB WASM, 18KB JS)
- Debug build includes source maps for development (3.3MB WASM, 77KB JS)
- WASM binary well under 5MB target requirement
- Created CI workflow (.github/workflows/build.yml) for native builds (Ubuntu, macOS) and WASM builds
- CI validates WASM binary size < 5MB and tests module loading in Node.js
- Files changed:
  - livecalc-engine/CMakeLists.txt (Emscripten toolchain support, WASM target configuration)
  - livecalc-engine/src/wasm/exports.cpp (new - C interface for WASM)
  - livecalc-engine/README.md (WASM build instructions, JavaScript usage examples)
  - .github/workflows/build.yml (new - CI for native and WASM builds)
- Tests: WASM module loads and executes valuation successfully in Node.js

## 2026-01-23 23:22 - US-002: JavaScript API Wrapper (PRD-LC-002) - COMPLETE

- Created @livecalc/engine TypeScript package with clean API for WASM engine
- Implemented LiveCalcEngine class with async initialization, data loading, and valuation execution
- Created comprehensive TypeScript type definitions for all data structures (Policy, MortalityTable, LapseTable, ExpenseAssumptions, ValuationConfig, ValuationResult)
- LiveCalcEngine methods:
  - `initialize(createModule)` - Initialize WASM module
  - `loadPoliciesFromCsv(csv)` / `loadPolicies(policies)` - Load policy data
  - `loadMortalityFromCsv(csv)` / `loadMortality(mortality)` - Load mortality table
  - `loadLapseFromCsv(csv)` / `loadLapse(lapse)` - Load lapse rates
  - `loadExpensesFromCsv(csv)` / `loadExpenses(expenses)` - Load expense assumptions
  - `runValuation(config)` - Run nested stochastic valuation
  - `getResultJson()` - Get result as JSON string
  - `dispose()` - Free resources
- Added HEAPU8 and HEAPF64 to WASM module exports for direct memory access
- Error handling with meaningful messages and error codes (LiveCalcError class)
- Works in both Node.js and browser environments (ES6 modules)
- Files changed:
  - livecalc-engine/js/package.json (new - npm package configuration)
  - livecalc-engine/js/tsconfig.json (new - TypeScript configuration)
  - livecalc-engine/js/vitest.config.ts (new - test configuration)
  - livecalc-engine/js/src/index.ts (new - module exports)
  - livecalc-engine/js/src/engine.ts (new - LiveCalcEngine class)
  - livecalc-engine/js/src/types.ts (new - TypeScript type definitions)
  - livecalc-engine/js/tests/engine.test.ts (new - 30 unit tests with mocks)
  - livecalc-engine/js/tests/integration.test.ts (new - 13 integration tests with real WASM)
  - livecalc-engine/CMakeLists.txt (added HEAPU8, HEAPF64 exports)
  - livecalc-engine/README.md (added JavaScript API wrapper documentation)
- Tests: 43 tests pass (30 unit tests + 13 integration tests)

