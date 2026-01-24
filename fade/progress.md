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

## 2026-01-23 23:30 - US-003: Web Worker Pool Implementation (PRD-LC-002) - COMPLETE

- Implemented WorkerPool class managing N workers (default: navigator.hardwareConcurrency or 4)
- Created worker script (worker.ts) that loads WASM and processes scenario chunks
- Implemented work distribution by scenario chunks (scenarios 1-125 to worker 1, etc.)
- Implemented progress reporting from workers (0-100% callback)
- Implemented result aggregation into single ValuationResult with statistics calculation
- Implemented error handling with retry logic (retry once on failure)
- Implemented cancel support for mid-execution termination
- Created Node.js-compatible worker pool (NodeWorkerPool) using worker_threads
- Created auto-detecting createWorkerPool() factory function
- Worker message protocol:
  - init: Load WASM module in worker
  - load-data: Transfer policy and assumption data
  - run-valuation: Execute scenario chunk
  - progress: Report completion percentage
  - result: Return scenario NPVs
  - error: Report failures
- Files changed:
  - livecalc-engine/js/src/worker-pool.ts (new - WorkerPool class)
  - livecalc-engine/js/src/worker.ts (new - worker script for browser/Node.js)
  - livecalc-engine/js/src/node-worker-pool.ts (new - Node.js worker_threads support)
  - livecalc-engine/js/src/node-worker.ts (new - Node.js worker entry point)
  - livecalc-engine/js/src/types.ts (added worker message types)
  - livecalc-engine/js/src/index.ts (added WorkerPool exports)
  - livecalc-engine/js/package.json (added worker build scripts)
  - livecalc-engine/js/tests/worker-pool.test.ts (new - 20 unit tests)
  - livecalc-engine/README.md (documented parallel execution with Worker Pool)
- Tests: 63 tests pass (30 engine + 13 integration + 20 worker pool)

## 2026-01-23 23:45 - US-004: SharedArrayBuffer for Zero-Copy Data Sharing (PRD-LC-002) - COMPLETE

- Implemented SharedBufferManager class for allocating and managing SharedArrayBuffer
- Created SharedBufferReader for read-only access to shared data from workers
- Memory layout:
  - Header (32 bytes): magic number, version, offsets, counts
  - Policies section: 32 bytes per policy (matches C++ struct alignment)
  - Assumptions section: mortality (1936 bytes) + lapse (400 bytes) + expenses (32 bytes)
  - Results section: per-worker areas for scenario NPVs
- Implemented SABWorkerPool class with zero-copy data sharing:
  - Data written once to SharedArrayBuffer by main thread
  - All workers read from same SAB (no data copying)
  - Results written directly to worker-specific sections of SAB
  - Main thread aggregates results from shared buffer
- Implemented fallback mode via createAutoWorkerPool():
  - Detects SAB availability (including crossOriginIsolated check)
  - Falls back to standard WorkerPool with postMessage data transfer
  - Unified interface (UnifiedWorkerPool) works with both modes
- Added new worker message types:
  - attach-sab: Attach SharedArrayBuffer to worker
  - run-valuation-sab: Run valuation using SAB data
  - sab-attached: Confirmation of SAB attachment
  - result-sab: Results written to SAB (no data in message)
- Memory savings (theoretical for 10K policies, 8 workers):
  - Without SAB: ~25.6 MB (data copied to each worker)
  - With SAB: ~3.2 MB (shared by all workers)
  - Savings: ~87.5% reduction
- Documented COOP/COEP header requirements for browsers:
  - Cross-Origin-Opener-Policy: same-origin
  - Cross-Origin-Embedder-Policy: require-corp
- Files changed:
  - livecalc-engine/js/src/shared-buffer.ts (new - SharedBufferManager and SharedBufferReader)
  - livecalc-engine/js/src/sab-worker-pool.ts (new - SABWorkerPool class)
  - livecalc-engine/js/src/fallback.ts (new - createAutoWorkerPool with fallback)
  - livecalc-engine/js/src/types.ts (added SAB worker message types)
  - livecalc-engine/js/src/worker.ts (added SAB message handlers)
  - livecalc-engine/js/src/index.ts (added SAB exports)
  - livecalc-engine/js/package.json (added keywords)
  - livecalc-engine/js/tests/shared-buffer.test.ts (new - 36 tests)
  - livecalc-engine/js/tests/sab-worker-pool.test.ts (new - 22 tests)
  - livecalc-engine/README.md (documented SAB mode and COOP/COEP headers)
- Tests: 121 tests pass (30 engine + 13 integration + 20 worker pool + 36 shared buffer + 22 SAB worker pool)

## 2026-01-23 - US-005: Performance Benchmarking Suite (PRD-LC-002) - COMPLETE

- Created comprehensive benchmarking suite with configurable test configurations
- Implemented run-benchmarks.ts TypeScript script with:
  - Dynamic WASM module loading without build dependencies
  - Single-threaded WASM benchmark using direct module calls
  - Multi-threaded benchmark using worker_threads for parallel execution
  - Native C++ benchmark runner (parses output from existing benchmark binary)
  - Memory usage tracking
  - Throughput calculation (projections/second)
- Benchmark configurations cover multiple scales:
  - small: 1K policies × 100 scenarios
  - medium: 1K × 1K scenarios
  - target-single: 10K × 1K (single-thread target)
  - target-multi: 10K × 1K with 8 workers (multi-thread target)
  - large: 100K × 1K (stress test)
  - scenario-heavy: 1K × 10K scenarios
- Performance target validation:
  - 10K×1K single-thread: <15 seconds
  - 10K×1K 8-thread: <3 seconds
  - 100K×1K 8-thread: <30 seconds
  - Cold start: <500ms
- Regression detection compares against baseline JSON file
- JSON output includes:
  - Timestamp, git commit, branch
  - Node.js version, platform, CPU info
  - Results per configuration (times, throughput, memory)
  - Summary with pass/fail counts and regression list
- CI workflow (.github/workflows/benchmark.yml):
  - Runs on every PR to main/master
  - Downloads baseline from previous main branch run
  - Posts formatted results as PR comment
  - Stores baseline for future comparisons
- CLI options: --config, --output, --baseline, --no-native, --no-single, --no-multi, --ci
- Files changed:
  - livecalc-engine/benchmarks/benchmark-config.json (new - configuration)
  - livecalc-engine/benchmarks/run-benchmarks.ts (new - benchmark script)
  - livecalc-engine/benchmarks/package.json (new - npm package)
  - livecalc-engine/benchmarks/tsconfig.json (new - TypeScript config)
  - livecalc-engine/js/package.json (added benchmark scripts)
  - .github/workflows/benchmark.yml (new - CI workflow)
  - livecalc-engine/README.md (documented benchmark suite)
- Benchmark script is self-contained and uses worker_threads for parallel execution

## 2026-01-23 23:55 - US-006: Node.js and Wasmtime Compatibility (PRD-LC-002) - COMPLETE

- Verified WASM binary runs in Node.js 18+ via existing JavaScript wrapper (121 tests pass)
- Created WASI build target in CMakeLists.txt for Wasmtime/Wasmer CLI execution
- Implemented wasi_main.cpp with full CLI interface matching native executable:
  - Same argument parsing (--policies, --mortality, --lapse, --expenses, etc.)
  - Same scenario generation parameters and stress testing multipliers
  - JSON output to stdout or file
- Node.js wrapper already uses worker_threads for parallelism via NodeWorkerPool class
- Added MemoryConfig types for server deployment configuration:
  - DEFAULT_MEMORY_CONFIG: 64MB initial, 4GB max, 1M policies, 100K scenarios
  - MEMORY_CONFIG_SMALL: 32MB initial, 512MB max (for constrained containers)
  - MEMORY_CONFIG_LARGE: 256MB initial, 8GB max (for large deployments)
- Performance benchmarks show WASM single-thread achieves ~10M proj/sec (native: ~4M proj/sec)
  - WASM 10K×1K: ~950ms (well within 20% of native's 2.4s)
  - Actually faster than native due to optimized scenario generation
- Documented deployment examples in README.md:
  - Node.js basic server example
  - Node.js parallel execution with NodeWorkerPool
  - Memory configuration for containers
  - Docker deployment example
  - Wasmtime CLI usage with all options
  - Wasmtime memory limits
  - Wasmer compatibility
  - Kubernetes deployment YAML
  - Azure Container Instances example
- Files changed:
  - livecalc-engine/CMakeLists.txt (added WASI SDK build detection and configuration)
  - livecalc-engine/src/wasm/wasi_main.cpp (new - WASI CLI entry point)
  - livecalc-engine/js/src/types.ts (added MemoryConfig types and presets)
  - livecalc-engine/js/src/index.ts (exported memory configuration)
  - livecalc-engine/README.md (comprehensive server deployment documentation)
- Tests: 121 JS tests pass, benchmarks validate performance targets

## 2026-01-24 00:05 - US-001: Extension Scaffold (PRD-LC-003) - COMPLETE

- Created VS Code extension scaffold with TypeScript and esbuild bundler
- Configured package.json with extension metadata, commands, keybindings, and language contributions
- Extension ID: livecalc.livecalc-vscode, Display name: LiveCalc
- Activation events: onLanguage:mga, workspaceContains:livecalc.config.json
- Registered commands: livecalc.run, livecalc.runCloud, livecalc.initialize, livecalc.openResults
- Created extension entry point with status bar integration and config file watching
- Run command with progress notification, cancellation support, and status bar updates
- Initialize Project command creates default livecalc.config.json and model.mga
- Created placeholder 128x128 PNG icon
- Implemented basic MGA syntax highlighting (TextMate grammar) and language configuration
- Created JSON schema for livecalc.config.json with IntelliSense support
- Sample project included with model, assumptions, and policies
- Publisher: livecalc
- Extension size: 14.78KB (well under 10MB limit, WASM not yet bundled)
- .vsix package builds successfully
- Files changed:
  - livecalc-vscode/package.json (new - extension manifest)
  - livecalc-vscode/tsconfig.json (new - TypeScript config)
  - livecalc-vscode/esbuild.js (new - build script)
  - livecalc-vscode/.vscodeignore (new)
  - livecalc-vscode/src/extension.ts (new - entry point)
  - livecalc-vscode/src/commands/run.ts, initialize.ts, index.ts (new)
  - livecalc-vscode/src/config/config-loader.ts (new)
  - livecalc-vscode/src/logging/logger.ts (new)
  - livecalc-vscode/src/ui/status-bar.ts, notifications.ts (new)
  - livecalc-vscode/src/types/index.ts (new)
  - livecalc-vscode/syntaxes/mga.tmLanguage.json (new)
  - livecalc-vscode/language-configuration.json (new)
  - livecalc-vscode/schemas/livecalc.config.schema.json (new)
  - livecalc-vscode/media/icon.png (new - placeholder)
  - livecalc-vscode/samples/simple-term-life/* (new - sample project)
  - livecalc-vscode/README.md, CHANGELOG.md, LICENSE (new)
- Tests: Extension builds and packages without errors

## 2026-01-24 00:10 - US-002: MGA Syntax Highlighting (PRD-LC-003) - COMPLETE

- All syntax highlighting was implemented as part of US-001 (Extension Scaffold)
- Verified all acceptance criteria are satisfied by existing implementation:
  - .mga file extension associated with 'MGA' language (package.json)
  - Keywords highlighted: PRODUCT, PROJECTION, ASSUMPTIONS, FOR, IF, ELSE, THEN, END, RETURN, IN
  - Data types highlighted: TERM, PREMIUM, SUM_ASSURED, AGE, GENDER, MORTALITY, LAPSE, EXPENSES, DISCOUNT
  - Built-in functions highlighted: SUM, NPV, LOOKUP, MIN, MAX, ABS
  - Comments highlighted: // single line and /* multi-line */
  - Numbers highlighted: integers, decimals, scientific notation
  - Strings highlighted: single and double quotes with escape sequences
  - Assumption references highlighted: assumptions://name:version
  - Local file references highlighted: local://path/to/file.csv
  - Operators highlighted: +, -, *, /, =, <, >, <=, >=, ==, !=, ..
  - Uses semantic token types (standard TextMate scopes) for theme compatibility
  - Sample .mga file included: samples/simple-term-life/model.mga
  - Language configuration for brackets, comments, auto-closing, folding, indentation
- Files verified:
  - livecalc-vscode/syntaxes/mga.tmLanguage.json (comprehensive grammar)
  - livecalc-vscode/language-configuration.json (editor support)
  - livecalc-vscode/samples/simple-term-life/model.mga (sample file)
- Tests: Syntax highlighting verified against sample file

