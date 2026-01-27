# LiveCalc Engine

A C++ projection engine for actuarial calculations, designed to compile to WASM for browser and server execution.

## Building

### Native Build

```bash
cd livecalc-engine
mkdir build && cd build
cmake ..
make
```

### WASM Build (Emscripten)

The engine can be compiled to WebAssembly for browser and Node.js execution.

**Prerequisites:**
- Install Emscripten: `brew install emscripten` (macOS) or [follow official instructions](https://emscripten.org/docs/getting_started/downloads.html)

**Release Build (optimized):**
```bash
cd livecalc-engine
mkdir build-wasm && cd build-wasm
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release
emmake make
```

**Debug Build (with source maps):**
```bash
mkdir build-wasm-debug && cd build-wasm-debug
emcmake cmake .. -DCMAKE_BUILD_TYPE=Debug
emmake make
```

**Output:**
- `livecalc.wasm` - WASM binary (~100KB release, ~3MB debug)
- `livecalc.mjs` - ES6 JavaScript module (~18KB release)

### SIMD Build (with SIMD128 instructions)

SIMD-enabled builds use 128-bit vector instructions for potential performance improvements
on supported browsers and runtimes.

**Build SIMD-enabled WASM:**
```bash
mkdir build-wasm-simd && cd build-wasm-simd
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -DENABLE_SIMD=ON
emmake make
```

**Output:**
- `livecalc-simd.wasm` - SIMD-enabled WASM binary (~100KB)
- `livecalc-simd.mjs` - ES6 JavaScript module with `createLiveCalcModuleSimd` export

**Browser/Runtime Support for SIMD:**

| Runtime | Minimum Version | Notes |
|---------|-----------------|-------|
| Chrome  | 91+ (May 2021)  | Native support |
| Firefox | 89+ (June 2021) | Native support |
| Safari  | 16.4+ (March 2023) | Native support |
| Edge    | 91+ (May 2021)  | Chromium-based |
| Node.js | 16+ | Native support (no flag needed since 16.4) |

**Feature Detection in JavaScript:**
```typescript
import { isSimdSupported, selectSimdModule } from '@livecalc/engine';

// Simple check
if (isSimdSupported()) {
  const module = await import('./livecalc-simd.mjs');
} else {
  const module = await import('./livecalc.mjs');
}

// Or use the helper function
const selection = selectSimdModule({
  simdModule: './livecalc-simd.mjs',
  scalarModule: './livecalc.mjs',
});
const module = await import(selection.module);
```

### Build Comparison

| Build Type | WASM Size | JS Size | SIMD | Source Maps |
|------------|-----------|---------|------|-------------|
| Release    | ~100 KB   | ~18 KB  | No   | No          |
| Release+SIMD | ~100 KB | ~18 KB  | Yes  | No          |
| Debug      | ~3 MB     | ~77 KB  | No   | Yes         |

## Running Tests

```bash
cd build
ctest --output-on-failure
```

Or run the test executable directly:

```bash
./tests
```

## Command Line Usage

The CLI runs nested stochastic valuation with configurable inputs and outputs JSON results.

### Basic Example

```bash
./livecalc-engine \
    --policies data/sample_policies.csv \
    --mortality data/sample_mortality.csv \
    --lapse data/sample_lapse.csv \
    --expenses data/sample_expenses.csv \
    --scenarios 1000 --seed 42 \
    --output results.json
```

### Required Options

#### Data Input Methods

You can provide assumptions in two ways:

**Method 1: Individual Files**
| Option | Description |
|--------|-------------|
| `--policies <path>` | CSV or Parquet file with policy data |
| `--mortality <path>` | CSV file containing mortality table |
| `--lapse <path>` | CSV file containing lapse table |
| `--expenses <path>` | CSV file containing expense assumptions |

**Method 2: Assumptions Config (Recommended)**
| Option | Description |
|--------|-------------|
| `--policies <path>` | CSV or Parquet file with policy data |
| `--assumptions-config <path>` | JSON file with assumption references (see example below) |

### Scenario Generation Options

| Option | Default | Description |
|--------|---------|-------------|
| `--scenarios <count>` | 1000 | Number of scenarios to generate |
| `--seed <value>` | 42 | Random seed for reproducibility |
| `--initial-rate <rate>` | 0.04 | Initial interest rate (4%) |
| `--drift <value>` | 0.0 | Annual drift |
| `--volatility <value>` | 0.015 | Annual volatility (1.5%) |
| `--min-rate <rate>` | 0.0 | Minimum interest rate floor |
| `--max-rate <rate>` | 0.20 | Maximum interest rate ceiling |

### Stress Testing Options

| Option | Default | Description |
|--------|---------|-------------|
| `--mortality-mult <m>` | 1.0 | Mortality rate multiplier |
| `--lapse-mult <m>` | 1.0 | Lapse rate multiplier |
| `--expense-mult <m>` | 1.0 | Expense multiplier |

### Output Options

| Option | Default | Description |
|--------|---------|-------------|
| `--output <path>` | stdout | JSON output file path |
| `--help` | - | Show help message |

### JSON Output Format

```json
{
  "statistics": {
    "mean_npv": -2555.365327,
    "std_dev": 114.232369,
    "percentiles": {
      "p50": -2569.348541,
      "p75": -2472.041076,
      "p90": -2429.522587,
      "p95": -2386.039451,
      "p99": -2351.252942
    },
    "cte_95": -2737.136681
  },
  "execution_time_ms": 2.5,
  "scenario_count": 1000,
  "distribution": [...]
}
```

### Example: Stress Test with Higher Mortality

```bash
./livecalc-engine \
    --policies data/sample_policies.csv \
    --mortality data/sample_mortality.csv \
    --lapse data/sample_lapse.csv \
    --expenses data/sample_expenses.csv \
    --scenarios 1000 --seed 42 \
    --mortality-mult 1.2 \
    --output stressed_results.json
```

### Assumptions Config File

The assumptions config file (JSON) provides a centralized way to manage assumptions and scenario parameters:

```json
{
  "mortality": {
    "source": "local://../data/sample_mortality.csv",
    "multiplier": 1.0,
    "notes": "Standard mortality table"
  },
  "lapse": {
    "source": "local://../data/sample_lapse.csv",
    "multiplier": 1.0,
    "notes": "Level term lapse rates"
  },
  "expenses": {
    "source": "local://../data/sample_expenses.csv",
    "multiplier": 1.0,
    "notes": "Local expense assumptions"
  },
  "scenarios": {
    "count": 1000,
    "seed": 42,
    "initial_rate": 0.05,
    "drift": 0.0,
    "volatility": 0.01,
    "min_rate": 0.0,
    "max_rate": 0.15
  },
  "udf": {
    "enabled": false,
    "script": "examples/udf_smoker_adjustment.py",
    "timeout_ms": 1000
  }
}
```

Usage with config file:

```bash
./livecalc-engine \
    --policies data/sample_policies.csv \
    --assumptions-config assumptions.json \
    --output results.json
```

**Note:** Future versions will support `assumptions://table-name:version` references to the Assumptions Manager service. Currently, only `local://` paths are supported in the CLI.

### Parquet Support

The CLI supports Parquet files for efficient loading of large policy datasets:

```bash
./livecalc-engine \
    --policies data/policies.parquet \
    --assumptions-config assumptions.json \
    --output results.json
```

Parquet support is optional and requires building with `-DENABLE_PARQUET=ON` and the Apache Arrow library installed.

### Python UDF Integration

Python User-Defined Functions (UDFs) allow you to customize calculation logic without recompiling C++:

```bash
./livecalc-engine \
    --policies data/sample_policies.csv \
    --assumptions-config assumptions.json \
    --udfs scripts/smoker_adjustment.py \
    --output results.json
```

The UDF script can define functions like `adjust_mortality()` and `adjust_lapse()` that are called during projection to modify rates dynamically. See `examples/udf_smoker_adjustment.py` for a working example.

**UDF Metrics:**
When UDFs are used, the CLI reports:
- Total UDF calls made during execution
- Total time spent in UDF execution
- UDF overhead as percentage of total execution time

## Memory Footprint

### Policy Struct

| Field | Type | Size (bytes) |
|-------|------|--------------|
| policy_id | uint32_t | 4 |
| age | uint8_t | 1 |
| gender | uint8_t (enum) | 1 |
| sum_assured | double | 8 |
| premium | double | 8 |
| term | uint8_t | 1 |
| product_type | uint8_t (enum) | 1 |
| **Total serialized** | | **24** |

**Note:** The actual `sizeof(Policy)` may be larger due to struct alignment/padding (typically 32 bytes on 64-bit systems). The serialized binary format uses exactly 24 bytes per policy.

### Memory Requirements

| Policies | Serialized Size | In-Memory (approx) |
|----------|-----------------|-------------------|
| 1,000 | 24 KB | 32 KB |
| 10,000 | 240 KB | 320 KB |
| 100,000 | 2.4 MB | 3.2 MB |
| 1,000,000 | 24 MB | 32 MB |

The engine comfortably supports 100,000+ policies in memory on modern hardware.

## Data Formats

### CSV Format

Policies can be loaded from CSV files with the following columns:

```csv
policy_id,age,gender,sum_assured,premium,term,product_type
1,30,M,100000,500,20,Term
2,45,Female,250000,1200.50,30,WholeLife
```

- **gender**: Accepts "M", "Male", "0" for male; "F", "Female", "1" for female
- **product_type**: Accepts "Term", "WholeLife", "Endowment" or numeric codes 0, 1, 2

### Binary Format

For WASM deployment, policies can be serialized to a compact binary format:
- 4-byte header containing policy count (uint32_t)
- Followed by N × 24 bytes of policy data

Use `PolicySet::serialize()` and `PolicySet::deserialize()` for binary I/O.

## Assumption Tables

### Mortality Table

Stores qx (probability of death within one year) by age (0-120) and gender.

```csv
age,male_qx,female_qx
0,0.00450,0.00380
30,0.00091,0.00038
60,0.01828,0.01172
120,1.00000,1.00000
```

**Memory:** 1,936 bytes (121 ages × 2 genders × 8 bytes)

Usage:
```cpp
MortalityTable mortality = MortalityTable::load_from_csv("mortality.csv");
double qx = mortality.get_qx(45, Gender::Male);           // Base rate
double adjusted = mortality.get_qx(45, Gender::Male, 1.1); // With 1.1x multiplier
```

### Lapse Table

Stores lapse rates (probability of voluntary surrender) by policy year (1-50).

```csv
year,lapse_rate
1,0.15
2,0.12
5,0.06
10,0.03
```

**Memory:** 400 bytes (50 years × 8 bytes)

Usage:
```cpp
LapseTable lapse = LapseTable::load_from_csv("lapse.csv");
double rate = lapse.get_rate(5);           // Base rate for year 5
double adjusted = lapse.get_rate(5, 1.5);  // With 1.5x multiplier
```

### Expense Assumptions

Stores expense parameters for projection calculations.

```csv
name,value
per_policy_acquisition,500
per_policy_maintenance,50
percent_of_premium,0.05
claim_expense,100
```

**Memory:** 32 bytes (4 doubles)

Usage:
```cpp
ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv("expenses.csv");
double first_year = expenses.first_year_expense(1000.0);  // Premium of 1000
double renewal = expenses.renewal_expense(1000.0);
double adjusted = expenses.first_year_expense(1000.0, 1.2);  // With 1.2x multiplier
```

### Assumption Multipliers

All assumption tables support multipliers to stress-test results:

- Mortality multiplier (e.g., 1.1 = 10% higher mortality)
- Lapse multiplier (e.g., 0.8 = 20% lower lapses)
- Expense multiplier (e.g., 1.2 = 20% higher expenses)

Multiplied rates are automatically capped at 1.0 for probability values.

## Economic Scenarios

### Scenario Structure

A Scenario contains interest rates for years 1-50, used to discount cash flows in projections.

```cpp
Scenario scenario;
scenario.set_rate(1, 0.03);  // 3% rate for year 1
scenario.set_rate(2, 0.035); // 3.5% rate for year 2

double rate = scenario.get_rate(5);           // Get rate for year 5
double df = scenario.get_discount_factor(10); // Cumulative discount to year 10
```

**Memory:** 400 bytes per scenario (50 years × 8 bytes)

### Scenario Generation

ScenarioSet generates multiple scenarios using Geometric Brownian Motion (GBM):

```cpp
ScenarioGeneratorParams params;
params.initial_rate = 0.03;   // Starting rate (3%)
params.drift = 0.0;           // Annual drift (0% = no trend)
params.volatility = 0.01;     // Annual volatility (1%)
params.min_rate = 0.0;        // Floor (0%)
params.max_rate = 0.20;       // Ceiling (20%)

// Generate 1000 scenarios with seed 42 for reproducibility
ScenarioSet scenarios = ScenarioSet::generate(1000, params, 42);
```

### Seed-Based Reproducibility

Using the same seed produces identical scenarios:

```cpp
auto set1 = ScenarioSet::generate(100, params, 12345);
auto set2 = ScenarioSet::generate(100, params, 12345);
// set1 and set2 are identical
```

### CSV Loading

Scenarios can be loaded from CSV in two formats:

**Wide format** (one row per scenario):
```csv
scenario_id,year_1,year_2,year_3,...,year_50
1,0.030,0.031,0.032,...,0.040
2,0.025,0.024,0.023,...,0.020
```

**Long format** (one row per year):
```csv
scenario_id,year,rate
1,1,0.030
1,2,0.031
2,1,0.025
2,2,0.024
```

### Memory Requirements

| Scenarios | Memory |
|-----------|--------|
| 1,000 | ~400 KB |
| 10,000 | ~4 MB |

The engine supports 10,000+ scenarios for nested stochastic valuation.

## Single Policy Projection

The `project_policy()` function projects a single policy under a single economic scenario, returning the Net Present Value (NPV) of cash flows.

### Basic Usage

```cpp
#include "projection.hpp"

// Load data
PolicySet policies = PolicySet::load_from_csv("policies.csv");
MortalityTable mortality = MortalityTable::load_from_csv("mortality.csv");
LapseTable lapse = LapseTable::load_from_csv("lapse.csv");
ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv("expenses.csv");
Scenario scenario = ...;  // From ScenarioSet or loaded from CSV

// Project single policy
ProjectionResult result = project_policy(
    policies.get(0),
    mortality,
    lapse,
    expenses,
    scenario
);

double npv = result.npv;  // Net present value
```

### Detailed Cash Flows

To get year-by-year cash flow breakdowns:

```cpp
ProjectionConfig config;
config.detailed_cashflows = true;

ProjectionResult result = project_policy(policy, mortality, lapse, expenses, scenario, config);

for (const auto& cf : result.cashflows) {
    std::cout << "Year " << (int)cf.year << ": "
              << "Lives=" << cf.lives_boy << ", "
              << "Premium=" << cf.premium_income << ", "
              << "Deaths=" << cf.death_benefit << ", "
              << "Expenses=" << cf.expenses << ", "
              << "Net CF=" << cf.net_cashflow << ", "
              << "Discounted=" << cf.discounted_cashflow << std::endl;
}
```

### Projection Logic

Each policy year:
1. **Premium income**: Collect premium from lives in-force at beginning of year
2. **Death decrements**: Apply mortality (qx × lives × sum_assured)
3. **Lapse decrements**: Apply lapse rates to survivors (currently surrender value = 0 for term products)
4. **Expenses**: First year includes acquisition costs; all years include maintenance and % of premium
5. **Discounting**: Apply scenario discount factors (cumulative product of 1/(1+r))

**Sign convention**: Positive = cash inflow to company, Negative = cash outflow

### Assumption Multipliers

Apply stress factors to assumptions:

```cpp
ProjectionConfig config;
config.mortality_multiplier = 1.10;  // 10% increase in mortality
config.lapse_multiplier = 0.80;      // 20% decrease in lapses
config.expense_multiplier = 1.15;    // 15% increase in expenses

ProjectionResult stressed = project_policy(policy, mortality, lapse, expenses, scenario, config);
```

### Edge Case Handling

- **Age > 120**: Uses age 120 mortality rates (capped at MAX_AGE)
- **Term > 50**: Projects limited to min(policy.term, MAX_YEAR=50)
- **Zero term**: Returns NPV = 0
- **All lives depleted**: Projection stops early if lives < 1e-10

## Nested Stochastic Valuation

The `run_valuation()` function performs nested stochastic valuation across all scenarios and policies, returning statistical results.

### Basic Usage

```cpp
#include "valuation.hpp"

// Load data
PolicySet policies = PolicySet::load_from_csv("policies.csv");
MortalityTable mortality = MortalityTable::load_from_csv("mortality.csv");
LapseTable lapse = LapseTable::load_from_csv("lapse.csv");
ExpenseAssumptions expenses = ExpenseAssumptions::load_from_csv("expenses.csv");

// Generate stochastic scenarios
ScenarioGeneratorParams params(0.04, 0.0, 0.015, 0.0, 0.15);
ScenarioSet scenarios = ScenarioSet::generate(1000, params, 42);

// Run valuation
ValuationResult result = run_valuation(
    policies, mortality, lapse, expenses, scenarios);

// Access results
std::cout << "Mean NPV: " << result.mean_npv << std::endl;
std::cout << "Std Dev: " << result.std_dev << std::endl;
std::cout << "P95: " << result.p95() << std::endl;
std::cout << "CTE_95: " << result.cte_95 << std::endl;
std::cout << "Execution time: " << result.execution_time_ms << " ms" << std::endl;
```

### Valuation Algorithm

The nested stochastic valuation follows this structure:

1. **Outer loop**: Iterate over all scenarios
2. **Inner loop**: For each scenario, project all policies and sum NPVs
3. **Statistics**: Calculate summary statistics across scenario results

```
For each scenario s in ScenarioSet:
    scenario_npv = 0
    For each policy p in policies:
        scenario_npv += project_policy(p, assumptions, s).npv
    scenario_npvs.append(scenario_npv)

Calculate: mean, std_dev, percentiles, CTE
```

### Result Statistics

| Statistic | Description |
|-----------|-------------|
| `mean_npv` | Mean NPV across all scenarios |
| `std_dev` | Standard deviation (population) |
| `percentiles[0-4]` | P50, P75, P90, P95, P99 |
| `cte_95` | Conditional Tail Expectation at 95% (average of worst 5%) |
| `scenario_npvs` | Individual scenario NPVs (for distribution charting) |
| `execution_time_ms` | Total execution time in milliseconds |

### Percentile Accessors

```cpp
result.p50();  // Median (50th percentile)
result.p75();  // 75th percentile
result.p90();  // 90th percentile
result.p95();  // 95th percentile
result.p99();  // 99th percentile
```

### CTE (Conditional Tail Expectation)

CTE_95 represents the average NPV of the worst 5% of scenarios. This is a key risk metric for actuarial reserving:

- It captures tail risk better than VaR (percentiles)
- Provides insight into severe but plausible outcomes
- Used in regulatory frameworks like Solvency II

### Configuration Options

```cpp
ValuationConfig config;
config.store_scenario_npvs = true;   // Store individual scenario NPVs
config.mortality_multiplier = 1.10;  // 10% increase in mortality
config.lapse_multiplier = 0.80;      // 20% decrease in lapses
config.expense_multiplier = 1.15;    // 15% increase in expenses

ValuationResult result = run_valuation(
    policies, mortality, lapse, expenses, scenarios, config);
```

### Performance

Typical execution times (native, single-threaded):

| Scale | Policies | Scenarios | Projections | Time |
|-------|----------|-----------|-------------|------|
| Small | 1,000 | 100 | 100K | ~25 ms |
| Medium | 1,000 | 1,000 | 1M | ~250 ms |
| **Target** | **10,000** | **1,000** | **10M** | **~2.5 sec** |
| Large | 100,000 | 1,000 | 100M | ~25 sec |

Throughput: ~4 million projections/second (native, M1/M2 Mac).

### Running the Benchmark

```bash
cd build
./benchmark
```

The benchmark runs valuations at increasing scale and reports statistics and performance metrics.

## JavaScript API Wrapper (@livecalc/engine)

A TypeScript/JavaScript wrapper provides a clean API for the WASM engine.

### Installation

```bash
cd livecalc-engine/js
npm install
npm run build
```

### Basic Usage

```typescript
import { LiveCalcEngine, DEFAULT_SCENARIO_PARAMS } from '@livecalc/engine';
import createModule from './livecalc.mjs'; // WASM module

async function main() {
  const engine = new LiveCalcEngine();
  await engine.initialize(createModule);

  // Load data from CSV files
  engine.loadPoliciesFromCsv(policiesCsv);
  engine.loadMortalityFromCsv(mortalityCsv);
  engine.loadLapseFromCsv(lapseCsv);
  engine.loadExpensesFromCsv(expensesCsv);

  // Run valuation
  const result = engine.runValuation({
    numScenarios: 1000,
    seed: 42,
    scenarioParams: DEFAULT_SCENARIO_PARAMS,
    storeDistribution: true,
  });

  console.log('Mean NPV:', result.statistics.meanNpv);
  console.log('Std Dev:', result.statistics.stdDev);
  console.log('CTE 95:', result.statistics.cte95);
  console.log('P95:', result.statistics.percentiles.p95);

  // Clean up
  engine.dispose();
}
```

### Loading Data from Objects

```typescript
// Load policies as array
engine.loadPolicies([
  { policyId: 1, age: 30, gender: 'M', sumAssured: 100000, premium: 500, term: 20, productType: 'TERM' },
  { policyId: 2, age: 35, gender: 'F', sumAssured: 150000, premium: 750, term: 25, productType: 'TERM' },
]);

// Load expenses as object
engine.loadExpenses({
  perPolicyAcquisition: 500,
  perPolicyMaintenance: 50,
  percentOfPremium: 0.05,
  claimExpense: 100,
});
```

### Stress Testing with Multipliers

```typescript
const stressedResult = engine.runValuation({
  numScenarios: 1000,
  seed: 42,
  scenarioParams: {
    initialRate: 0.04,
    drift: 0.0,
    volatility: 0.02,
    minRate: 0.0,
    maxRate: 0.15,
  },
  mortalityMultiplier: 1.2,  // 20% increase in mortality
  lapseMultiplier: 0.8,      // 20% decrease in lapses
  expenseMultiplier: 1.1,    // 10% increase in expenses
  storeDistribution: true,
});
```

### API Reference

#### LiveCalcEngine

| Method | Description |
|--------|-------------|
| `initialize(createModule)` | Initialize WASM module |
| `loadPoliciesFromCsv(csv)` | Load policies from CSV string |
| `loadPolicies(policies)` | Load policies from array |
| `loadMortalityFromCsv(csv)` | Load mortality table from CSV |
| `loadLapseFromCsv(csv)` | Load lapse rates from CSV |
| `loadExpensesFromCsv(csv)` | Load expense assumptions from CSV |
| `loadExpenses(expenses)` | Load expense assumptions from object |
| `runValuation(config)` | Run nested stochastic valuation |
| `getResultJson()` | Get last result as JSON string |
| `getVersion()` | Get engine version |
| `getPolicyCount()` | Get number of loaded policies |
| `clearPolicies()` | Clear loaded policies |
| `dispose()` | Free resources and reset |

#### Properties

| Property | Description |
|----------|-------------|
| `isInitialized` | Whether WASM module is loaded |
| `isReady` | Whether all required data is loaded |

#### ValuationResult

```typescript
interface ValuationResult {
  statistics: {
    meanNpv: number;
    stdDev: number;
    percentiles: { p50, p75, p90, p95, p99: number };
    cte95: number;
  };
  executionTimeMs: number;
  scenarioCount: number;  // Only populated if storeDistribution: true
  distribution?: number[]; // Individual scenario NPVs
}
```

### Running Tests

```bash
cd livecalc-engine/js
npm test
```

---

## Parallel Execution with Worker Pool

For large-scale valuations, use the `WorkerPool` to execute across multiple CPU cores.

### Browser Usage

```typescript
import { WorkerPool, DEFAULT_SCENARIO_PARAMS } from '@livecalc/engine';

async function main() {
  const pool = new WorkerPool({
    numWorkers: 8,  // Use 8 workers (default: navigator.hardwareConcurrency)
    workerScript: '/livecalc-worker.js',  // Path to worker script
    wasmPath: '/livecalc.mjs',  // Path to WASM module
  });

  await pool.initialize();
  await pool.loadData(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);

  // Run valuation with progress reporting
  const result = await pool.runValuation(
    {
      numScenarios: 10000,
      seed: 42,
      scenarioParams: DEFAULT_SCENARIO_PARAMS,
    },
    (progress) => console.log(`${progress}% complete`)
  );

  console.log('Mean NPV:', result.statistics.meanNpv);
  console.log('Execution time:', result.executionTimeMs, 'ms');

  pool.terminate();
}
```

### Node.js Usage

```typescript
import { NodeWorkerPool, DEFAULT_SCENARIO_PARAMS } from '@livecalc/engine';

const pool = new NodeWorkerPool({
  numWorkers: 8,
  workerScript: './dist/node-worker.mjs',
  wasmPath: './wasm/livecalc.mjs',
});

await pool.initialize();
// ... same as browser usage
```

### Auto-detecting Environment

```typescript
import { createWorkerPool, DEFAULT_SCENARIO_PARAMS } from '@livecalc/engine';

// Automatically uses WorkerPool in browser, NodeWorkerPool in Node.js
const pool = createWorkerPool({
  numWorkers: 4,
  workerScript: '/livecalc-worker.js',
  wasmPath: '/livecalc.mjs',
});
```

### WorkerPool API Reference

#### WorkerPool / NodeWorkerPool

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize all workers and load WASM |
| `loadData(policies, mortality, lapse, expenses)` | Load CSV data into all workers |
| `runValuation(config, onProgress?)` | Run parallel valuation |
| `cancel()` | Cancel running valuation |
| `terminate()` | Stop all workers and clean up |

#### Properties

| Property | Description |
|----------|-------------|
| `workerCount` | Number of workers in the pool |
| `isInitialized` | Whether workers are initialized |
| `isReady` | Whether data is loaded and ready |

### Work Distribution

Scenarios are distributed evenly across workers:
- 1000 scenarios with 4 workers → 250 scenarios each
- Each worker loads its own WASM instance
- Each worker uses a different seed for unique scenarios
- Results are aggregated into a single `ValuationResult`

### Progress Reporting

The optional `onProgress` callback receives values from 0-100:

```typescript
await pool.runValuation(config, (percent) => {
  progressBar.value = percent;
});
```

### Error Handling and Retry

- Workers that fail are retried once
- If a worker fails after retry, the valuation fails
- Use `pool.cancel()` to stop a running valuation

### Performance with Worker Pool

Expected speedup with multiple workers:

| Workers | Speedup | 10K × 1K Time |
|---------|---------|---------------|
| 1 | 1x | ~15 sec |
| 4 | ~3.5x | ~4 sec |
| 8 | ~7x | ~2 sec |

Linear scaling validates ~7x speedup with 8 workers vs single-threaded.

---

## SharedArrayBuffer Zero-Copy Mode

For memory-efficient parallel execution, use `SABWorkerPool` to share data between workers without copying.

### Memory Savings

With N workers and P policies:
- **Without SAB**: N × P × 32 bytes (data copied to each worker)
- **With SAB**: P × 32 bytes (shared by all workers)

For 100K policies and 8 workers:
- Without SAB: ~25.6 MB
- With SAB: ~3.2 MB
- **Savings: ~87.5% reduction**

### Browser Requirements (COOP/COEP Headers)

SharedArrayBuffer requires cross-origin isolation. Your server must set these headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Example for Express.js:
```javascript
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});
```

Example for nginx:
```nginx
add_header Cross-Origin-Opener-Policy same-origin;
add_header Cross-Origin-Embedder-Policy require-corp;
```

You can verify isolation is enabled:
```javascript
console.log('Cross-origin isolated:', crossOriginIsolated);
```

### SABWorkerPool Usage

```typescript
import { SABWorkerPool, DEFAULT_SCENARIO_PARAMS } from '@livecalc/engine';

const pool = new SABWorkerPool({
  numWorkers: 8,
  workerScript: '/livecalc-worker.js',
  wasmPath: '/livecalc.mjs',
  maxPolicies: 100000,   // Pre-allocate space
  maxScenarios: 10000,
});

await pool.initialize();

// Data is written to SharedArrayBuffer, shared by all workers
await pool.loadDataFromCsv(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);

// Results are written directly to SharedArrayBuffer
const result = await pool.runValuation(
  { numScenarios: 10000, seed: 42, scenarioParams: DEFAULT_SCENARIO_PARAMS },
  (progress) => console.log(`${progress}% complete`)
);

// Check memory savings
console.log('Memory savings:', pool.getMemorySavings());

pool.terminate();
```

### Auto-Selecting with Fallback

For environments that may or may not support SharedArrayBuffer:

```typescript
import { createAutoWorkerPool } from '@livecalc/engine';

// Automatically uses SAB if available, falls back to copying otherwise
const pool = createAutoWorkerPool({
  numWorkers: 8,
  workerScript: '/livecalc-worker.js',
  wasmPath: '/livecalc.mjs',
});

console.log('Using SharedArrayBuffer:', pool.usesSharedArrayBuffer);

await pool.initialize();
// ... same API as WorkerPool or SABWorkerPool
```

### Checking SAB Availability

```typescript
import { isSharedArrayBufferAvailable, wouldUseSharedArrayBuffer } from '@livecalc/engine';

// Check if SAB is available in current environment
console.log('SAB available:', isSharedArrayBufferAvailable());

// Check if auto-selector would use SAB
console.log('Would use SAB:', wouldUseSharedArrayBuffer());
```

### SABWorkerPool API Reference

#### Configuration

```typescript
interface SABWorkerPoolConfig {
  numWorkers?: number;      // Default: navigator.hardwareConcurrency or 4
  workerScript: string;     // Path to worker script
  wasmPath: string;         // Path to WASM module
  maxPolicies?: number;     // Default: 100000
  maxScenarios?: number;    // Default: 10000
}
```

#### Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize workers and allocate SharedArrayBuffer |
| `loadDataFromCsv(...)` | Load CSV data into shared buffer |
| `loadData(policies, mortality, lapse, expenses)` | Load objects into shared buffer |
| `runValuation(config, onProgress?)` | Run parallel valuation |
| `getMemorySavings()` | Get memory usage comparison |
| `cancel()` | Cancel running valuation |
| `terminate()` | Stop all workers and free buffer |

#### Properties

| Property | Description |
|----------|-------------|
| `workerCount` | Number of workers |
| `isInitialized` | Whether workers are ready |
| `isReady` | Whether data is loaded |
| `usesSharedArrayBuffer` | Always true for SABWorkerPool |

### Unified Interface

The `UnifiedWorkerPool` interface provides a common API for both standard and SAB modes:

```typescript
import { createAutoWorkerPool, UnifiedWorkerPool } from '@livecalc/engine';

function runValuation(pool: UnifiedWorkerPool) {
  // Works with both WorkerPool and SABWorkerPool
  return pool.runValuation({
    numScenarios: 1000,
    seed: 42,
    scenarioParams: DEFAULT_SCENARIO_PARAMS,
  });
}
```

### Node.js Usage

```typescript
import { NodeSABWorkerPool, createSABWorkerPool } from '@livecalc/engine';

// Explicit Node.js SAB pool
const pool = new NodeSABWorkerPool({
  numWorkers: 8,
  workerScript: './dist/node-worker.mjs',
  wasmPath: './wasm/livecalc.mjs',
});

// Or auto-detecting
const pool2 = createSABWorkerPool({...});  // Uses NodeSABWorkerPool in Node.js
```

---

## WASM Low-Level Usage (JavaScript/Node.js)

For advanced use cases, the WASM module can be used directly without the wrapper.

### Loading the Module

```javascript
// ES6 module import
import createLiveCalcModule from './livecalc.mjs';

const Module = await createLiveCalcModule();
console.log('Version:', Module.UTF8ToString(Module._get_version()));
```

### Loading Data

```javascript
// Helper to allocate strings in WASM memory
function allocateString(Module, str) {
    const len = Module.lengthBytesUTF8(str);
    const ptr = Module._livecalc_malloc(len + 1);
    Module.stringToUTF8(str, ptr, len + 1);
    return { ptr, size: len };
}

// Load policies from CSV
const policyCsv = `policy_id,age,gender,sum_assured,premium,term,product_type
1,30,M,100000,500,20,Term
2,40,F,150000,800,15,Term`;

const policyData = allocateString(Module, policyCsv);
const policyCount = Module._load_policies_csv(policyData.ptr, policyData.size);
Module._livecalc_free(policyData.ptr);

// Similarly load mortality, lapse, and expenses
```

### Running Valuation

```javascript
// Run valuation with generated scenarios
const result = Module._run_valuation(
    1000,           // number of scenarios
    BigInt(42),     // seed (uint64_t requires BigInt)
    0.04,           // initial interest rate
    0.0,            // drift
    0.015,          // volatility
    0.0,            // min rate
    0.20,           // max rate
    1.0,            // mortality multiplier
    1.0,            // lapse multiplier
    1.0,            // expense multiplier
    1               // store distribution (1 = true)
);

if (result === 0) {
    console.log('Mean NPV:', Module._get_result_mean());
    console.log('Std Dev:', Module._get_result_std_dev());
    console.log('P95:', Module._get_result_p95());
    console.log('CTE95:', Module._get_result_cte95());
}
```

### JSON Results

```javascript
// Generate JSON result
const jsonLen = Module._generate_result_json();
const jsonPtr = Module._get_result_json_ptr();
const jsonStr = Module.UTF8ToString(jsonPtr, jsonLen);
const results = JSON.parse(jsonStr);
```

### Exported Functions

| Function | Description |
|----------|-------------|
| `_load_policies_csv(ptr, size)` | Load policies from CSV string |
| `_load_mortality_csv(ptr, size)` | Load mortality table from CSV |
| `_load_lapse_csv(ptr, size)` | Load lapse table from CSV |
| `_load_expenses_csv(ptr, size)` | Load expense assumptions from CSV |
| `_run_valuation(...)` | Execute nested stochastic valuation |
| `_get_result_mean()` | Get mean NPV from last valuation |
| `_get_result_std_dev()` | Get standard deviation |
| `_get_result_p50()` through `_get_result_p99()` | Get percentiles |
| `_get_result_cte95()` | Get CTE at 95% |
| `_generate_result_json()` | Generate JSON result string |
| `_get_result_json_ptr()` | Get pointer to JSON string |
| `_get_version()` | Get engine version |
| `_livecalc_malloc(size)` | Allocate WASM memory |
| `_livecalc_free(ptr)` | Free WASM memory |

---

## Performance Benchmarking Suite

A comprehensive benchmarking suite validates performance targets and detects regressions.

### Running Benchmarks

```bash
# Install dependencies
cd livecalc-engine/benchmarks
npm install

# Run all benchmarks
npm run benchmark

# Quick benchmarks (skip native)
npm run benchmark:quick

# CI mode (exits with error on failures)
npm run benchmark:ci
```

### Benchmark Configurations

| Name | Policies | Scenarios | Description |
|------|----------|-----------|-------------|
| small | 1,000 | 100 | Quick testing |
| medium | 1,000 | 1,000 | Medium scale |
| target-single | 10,000 | 1,000 | Single-thread target |
| target-multi | 10,000 | 1,000 | Multi-thread target (8 workers) |
| large | 100,000 | 1,000 | Large scale stress test |
| scenario-heavy | 1,000 | 10,000 | Many scenarios |

### Performance Targets

| Configuration | Target | Description |
|--------------|--------|-------------|
| 10K × 1K (single) | <15 sec | Single-threaded WASM |
| 10K × 1K (8 threads) | <3 sec | Multi-threaded WASM |
| 100K × 1K (8 threads) | <30 sec | Large scale multi-threaded |
| Cold start | <500 ms | WASM module initialization |

### CLI Options

```bash
npx tsx run-benchmarks.ts [options]

Options:
  -c, --config <path>    Path to benchmark config
  -o, --output <path>    Path for JSON output
  -b, --baseline <path>  Path to baseline for regression detection
  --no-native            Skip native C++ benchmarks
  --no-single            Skip single-threaded benchmarks
  --no-multi             Skip multi-threaded benchmarks
  --ci                   CI mode: exit 1 on failures/regressions
```

### JSON Output Format

```json
{
  "timestamp": "2026-01-23T12:00:00.000Z",
  "commit": "abc1234",
  "branch": "main",
  "nodeVersion": "v20.10.0",
  "platform": "darwin",
  "cpuCount": 8,
  "cpuModel": "Apple M2",
  "results": [
    {
      "config": { "name": "target-multi", "policies": 10000, "scenarios": 1000 },
      "nativeMs": null,
      "wasmSingleMs": 2500,
      "wasmMultiMs": 450,
      "wasmWorkers": 8,
      "memoryMb": 15.2,
      "projectionsPerSecond": 22222222,
      "meanNpv": -125000.50,
      "stdDev": 8500.25
    }
  ],
  "summary": {
    "targetsChecked": 4,
    "targetsPassed": 4,
    "targetsFailed": [],
    "regressions": []
  }
}
```

### Regression Detection

Compare against a baseline to detect performance regressions:

```bash
# Run with baseline comparison
npx tsx run-benchmarks.ts --baseline results/baseline.json --ci

# Output warns if any config is >10% slower than baseline
```

### CI Integration

Benchmarks run automatically on every PR via GitHub Actions:
- Results posted as PR comment
- Baseline stored from main branch
- Warnings on target failures or regressions

See `.github/workflows/benchmark.yml` for configuration

---

## Server Deployment

The LiveCalc engine supports multiple server-side deployment options for production workloads.

### Deployment Options Comparison

| Runtime | Use Case | Parallelism | Cold Start | Compatibility |
|---------|----------|-------------|------------|---------------|
| **Node.js** | API servers, microservices | worker_threads | ~500ms | Full JS wrapper |
| **Wasmtime** | CLI tools, containers | Native threads | ~50ms | WASI build |

### Node.js Deployment

The recommended approach for most server deployments.

#### Basic Node.js Server

```typescript
import { LiveCalcEngine, DEFAULT_SCENARIO_PARAMS } from '@livecalc/engine';
import createModule from './livecalc.mjs';
import { readFileSync } from 'node:fs';

const engine = new LiveCalcEngine();
await engine.initialize(createModule);

// Load data from files
const policies = readFileSync('./data/policies.csv', 'utf-8');
engine.loadPoliciesFromCsv(policies);
// ... load other data ...

// Run valuation
const result = engine.runValuation({
  numScenarios: 1000,
  seed: Date.now(),
  scenarioParams: DEFAULT_SCENARIO_PARAMS,
});

console.log(JSON.stringify(result));
```

#### Parallel Execution with Worker Pool

For large-scale valuations, use the NodeWorkerPool for parallel execution:

```typescript
import { NodeWorkerPool, DEFAULT_SCENARIO_PARAMS } from '@livecalc/engine';

const pool = new NodeWorkerPool({
  numWorkers: 8,  // Match container CPU allocation
  workerScript: './dist/node-worker.mjs',
  wasmPath: './wasm/livecalc.mjs',
});

await pool.initialize();
await pool.loadData(policiesCsv, mortalityCsv, lapseCsv, expensesCsv);

const result = await pool.runValuation({
  numScenarios: 10000,
  seed: 42,
  scenarioParams: DEFAULT_SCENARIO_PARAMS,
});

pool.terminate();
```

#### Memory Configuration for Containers

Configure memory limits to match your container constraints:

```typescript
import {
  DEFAULT_MEMORY_CONFIG,
  MEMORY_CONFIG_SMALL,
  MEMORY_CONFIG_LARGE,
} from '@livecalc/engine';

// For small containers (512MB RAM)
const smallConfig = MEMORY_CONFIG_SMALL;
// maxMemory: 512MB, maxPolicies: 100K, maxScenarios: 10K

// For large containers (8GB RAM)
const largeConfig = MEMORY_CONFIG_LARGE;
// maxMemory: 8GB, maxPolicies: 10M, maxScenarios: 1M

// Custom configuration
const customConfig = {
  initialMemory: 128 * 1024 * 1024,  // 128 MB
  maxMemory: 2 * 1024 * 1024 * 1024, // 2 GB
  maxPolicies: 500_000,
  maxScenarios: 50_000,
};
```

Memory estimates per component:
- Policies: ~32 bytes each
- Scenarios: ~400 bytes each
- Results: ~8 bytes per scenario NPV

#### Docker Deployment Example

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy WASM binary and JS wrapper
COPY build-wasm/livecalc.wasm ./wasm/
COPY build-wasm/livecalc.mjs ./wasm/

# Copy Node.js package
COPY js/dist ./dist/
COPY js/package.json ./

# Install production dependencies
RUN npm install --production

# Copy application code
COPY server.js ./

# Memory-constrained execution
CMD ["node", "--max-old-space-size=1024", "server.js"]
```

### Wasmtime Deployment

For standalone CLI execution or containers without Node.js.

#### Building the WASI Binary

The WASI build produces a standalone WASM binary that runs in Wasmtime/Wasmer:

```bash
# Install WASI SDK (https://github.com/WebAssembly/wasi-sdk)
export WASI_SDK_PATH=/opt/wasi-sdk

# Build WASI target
mkdir build-wasi && cd build-wasi
cmake .. \
  -DCMAKE_TOOLCHAIN_FILE=$WASI_SDK_PATH/share/cmake/wasi-sdk.cmake \
  -DCMAKE_BUILD_TYPE=Release
make
```

This produces `livecalc-wasi.wasm` (~200KB).

#### Running with Wasmtime

```bash
# Install Wasmtime (https://wasmtime.dev/)
curl https://wasmtime.dev/install.sh -sSf | bash

# Run valuation
wasmtime run livecalc-wasi.wasm -- \
    --policies data/policies.csv \
    --mortality data/mortality.csv \
    --lapse data/lapse.csv \
    --expenses data/expenses.csv \
    --scenarios 1000 \
    --seed 42 \
    --output results.json
```

#### Wasmtime CLI Options

```
Usage: wasmtime run livecalc-wasi.wasm -- [options]

Required options:
  --policies <path>     CSV file with policy data
  --mortality <path>    CSV file with mortality table
  --lapse <path>        CSV file with lapse rates
  --expenses <path>     CSV file with expense assumptions

Scenario options:
  --scenarios <count>   Number of scenarios (default: 1000)
  --seed <value>        Random seed (default: 42)
  --initial-rate <r>    Initial interest rate (default: 0.04)
  --drift <d>           Annual drift (default: 0.0)
  --volatility <v>      Annual volatility (default: 0.015)
  --min-rate <r>        Minimum interest rate (default: 0.0)
  --max-rate <r>        Maximum interest rate (default: 0.20)

Stress testing:
  --mortality-mult <m>  Mortality multiplier (default: 1.0)
  --lapse-mult <m>      Lapse multiplier (default: 1.0)
  --expense-mult <m>    Expense multiplier (default: 1.0)

Output:
  --output <path>       Output JSON file (default: stdout)
  --help                Show this help message
```

#### Wasmtime with Memory Limits

```bash
# Limit memory to 512MB
wasmtime run \
    --wasm-features=memory64 \
    --max-memory-size 536870912 \
    livecalc-wasi.wasm -- \
    --policies policies.csv \
    ...
```

#### Running with Wasmer

```bash
# Install Wasmer
curl https://get.wasmer.io -sSfL | sh

# Run (same interface)
wasmer run livecalc-wasi.wasm -- \
    --policies data/policies.csv \
    --mortality data/mortality.csv \
    --lapse data/lapse.csv \
    --expenses data/expenses.csv \
    --scenarios 1000
```

### Performance Comparison

Expected performance across runtimes (10K policies × 1K scenarios):

| Runtime | Single-Thread | 8-Thread | Relative |
|---------|--------------|----------|----------|
| Native C++ | ~2.5 sec | - | 1.0x |
| Wasmtime | ~3.0 sec | - | ~1.2x |
| Node.js WASM | ~3.2 sec | ~0.5 sec | ~1.3x / 0.2x |

Wasmtime delivers near-native performance (~20% overhead), while Node.js with worker_threads provides the best throughput for parallel workloads.

### Kubernetes Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: livecalc-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: livecalc
  template:
    metadata:
      labels:
        app: livecalc
    spec:
      containers:
      - name: engine
        image: livecalc/engine:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2"
        env:
        - name: NODE_OPTIONS
          value: "--max-old-space-size=1536"
        - name: WORKER_COUNT
          value: "2"
```

### Azure Container Instances Example

```bash
# Deploy to Azure
az container create \
    --resource-group myResourceGroup \
    --name livecalc \
    --image livecalc/engine:latest \
    --cpu 2 \
    --memory 2 \
    --environment-variables \
        NODE_OPTIONS="--max-old-space-size=1536" \
        WORKER_COUNT=2
```

---

## CalcEngine Interface (Pluggable Engines)

The `CalcEngine` interface provides an abstraction layer for pluggable calculation engines. This allows swapping different engines (LiveCalc WASM, Milliman Integrate, Milliman MIND, etc.) without changing the scheduler or worker pool implementation.

### Interface Overview

```typescript
import type { CalcEngine, ChunkConfig, ChunkResult, AssumptionBuffers } from '@livecalc/engine';

interface CalcEngine {
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): void;

  // Information
  getInfo(): EngineInfo;
  readonly isInitialized: boolean;
  readonly hasPolicies: boolean;
  readonly hasAssumptions: boolean;

  // Data loading
  loadPolicies(data: string | ArrayBuffer): Promise<number>;
  loadAssumptions(assumptions: AssumptionBuffers): Promise<void>;
  clearPolicies(): void;

  // Computation
  runChunk(config: ChunkConfig): Promise<ChunkResult>;
}
```

### Available Implementations

| Engine | Description | Use Case |
|--------|-------------|----------|
| `LiveCalcEngineAdapter` | Wraps LiveCalc WASM module | Production, real projections |
| `MockCalcEngine` | Generates deterministic mock results | Testing, development |

### Using LiveCalcEngineAdapter

```typescript
import { LiveCalcEngineAdapter, createLiveCalcEngineFactory } from '@livecalc/engine';
import createModule from './livecalc.mjs';

// Direct instantiation
const adapter = new LiveCalcEngineAdapter({ createModule });
await adapter.initialize();

// Or use factory pattern (for worker pools)
const factory = createLiveCalcEngineFactory(createModule);
const engine1 = factory();
const engine2 = factory();
```

### Using MockCalcEngine

```typescript
import {
  MockCalcEngine,
  createMockEngineFactory,
  createFastMockEngine,
  createRealisticMockEngine,
} from '@livecalc/engine';

// Fast mock for unit tests (no delay)
const fastEngine = createFastMockEngine();

// Realistic mock (~10M projections/sec)
const realisticEngine = createRealisticMockEngine();

// Custom configuration
const customEngine = new MockCalcEngine({
  msPerScenario: 0.01,    // Simulate 0.01ms per scenario
  baseMeanNpv: 1_000_000, // Mean NPV to generate
  stdDev: 100_000,        // Standard deviation
});

// Factory for worker pools
const factory = createMockEngineFactory({ msPerScenario: 0 });
```

### Running a Chunk

```typescript
import { DEFAULT_SCENARIO_PARAMS } from '@livecalc/engine';

// Load data
const policyCount = await engine.loadPolicies(policiesCsv);
await engine.loadAssumptions({
  mortality: mortalityCsv,
  lapse: lapseCsv,
  expenses: expensesCsv,
});

// Run chunk
const result = await engine.runChunk({
  numScenarios: 1000,
  seed: 42,
  scenarioParams: DEFAULT_SCENARIO_PARAMS,
  mortalityMultiplier: 1.0,
  lapseMultiplier: 1.0,
  expenseMultiplier: 1.0,
});

console.log('NPVs:', result.scenarioNpvs);
console.log('Time:', result.executionTimeMs, 'ms');
```

### Implementing a New Engine Adapter

To add support for a new calculation engine (e.g., Milliman Integrate), implement the `CalcEngine` interface:

```typescript
import type {
  CalcEngine,
  AssumptionBuffers,
  ChunkConfig,
  ChunkResult,
  EngineInfo,
  CalcEngineFactory,
} from '@livecalc/engine';

/**
 * Adapter for Milliman Integrate engine.
 */
class MillimanIntegrateAdapter implements CalcEngine {
  private api: IntegrateAPI | null = null;
  private initialized = false;
  private policiesLoaded = false;
  private assumptionsLoaded = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new Error('Already initialized');
    }

    // Initialize connection to Milliman Integrate
    this.api = await connectToIntegrate();
    this.initialized = true;
  }

  getInfo(): EngineInfo {
    return {
      name: 'Milliman Integrate',
      version: '5.0.0',
      maxPolicies: 10_000_000,
      maxScenariosPerChunk: 1_000_000,
      supportsBinaryInput: true,
    };
  }

  get isInitialized(): boolean {
    return this.initialized && this.api !== null;
  }

  get hasPolicies(): boolean {
    return this.policiesLoaded;
  }

  get hasAssumptions(): boolean {
    return this.assumptionsLoaded;
  }

  async loadPolicies(data: string | ArrayBuffer): Promise<number> {
    this.ensureInitialized();

    // Convert data to Integrate format and load
    const policies = parseToIntegrateFormat(data);
    await this.api!.loadPolicies(policies);

    this.policiesLoaded = true;
    return policies.length;
  }

  async loadAssumptions(assumptions: AssumptionBuffers): Promise<void> {
    this.ensureInitialized();

    // Map assumptions to Integrate format
    await this.api!.loadAssumptions({
      mortality: parseToIntegrateFormat(assumptions.mortality),
      lapse: parseToIntegrateFormat(assumptions.lapse),
      expenses: parseToIntegrateFormat(assumptions.expenses),
    });

    this.assumptionsLoaded = true;
  }

  clearPolicies(): void {
    this.ensureInitialized();
    this.api!.clearData();
    this.policiesLoaded = false;
  }

  async runChunk(config: ChunkConfig): Promise<ChunkResult> {
    this.ensureInitialized();
    this.ensureDataLoaded();

    const startTime = performance.now();

    // Call Integrate engine
    const npvs = await this.api!.runProjection({
      scenarios: config.numScenarios,
      seed: config.seed,
      interestRates: config.scenarioParams,
      multipliers: {
        mortality: config.mortalityMultiplier ?? 1.0,
        lapse: config.lapseMultiplier ?? 1.0,
        expense: config.expenseMultiplier ?? 1.0,
      },
    });

    return {
      scenarioNpvs: new Float64Array(npvs),
      executionTimeMs: performance.now() - startTime,
    };
  }

  dispose(): void {
    if (this.api) {
      this.api.disconnect();
      this.api = null;
    }
    this.initialized = false;
    this.policiesLoaded = false;
    this.assumptionsLoaded = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.api) {
      throw new Error('Engine not initialized');
    }
  }

  private ensureDataLoaded(): void {
    if (!this.policiesLoaded) {
      throw new Error('Policies not loaded');
    }
    if (!this.assumptionsLoaded) {
      throw new Error('Assumptions not loaded');
    }
  }
}

// Factory function for worker pools
function createMillimanIntegrateFactory(): CalcEngineFactory {
  return () => new MillimanIntegrateAdapter();
}
```

### Implementation Guidelines

When implementing a new engine adapter, follow these principles:

1. **Stateless Design**: The engine should not maintain state between `runChunk` calls. All necessary data should be passed as parameters.

2. **Thread Safety**: Implementations will be used from multiple workers. Each worker has its own engine instance, so no shared state synchronization is needed, but the implementation must be reentrant.

3. **Error Handling**: Throw descriptive errors on failure. The worker pool will catch and report these errors.

4. **Memory Management**: Engines are responsible for their own memory. Call `dispose()` when done to free resources.

5. **Binary Support**: If your engine supports binary data, set `supportsBinaryInput: true` in `getInfo()` and handle both `string` and `ArrayBuffer` inputs in `loadPolicies` and `loadAssumptions`.

6. **Determinism**: Using the same seed should produce the same results for reproducibility.

### Testing Your Adapter

Use the `MockCalcEngine` test suite as a reference:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CalcEngine } from '@livecalc/engine';

describe('MyCustomAdapter', () => {
  let engine: CalcEngine;

  beforeEach(async () => {
    engine = new MyCustomAdapter();
    await engine.initialize();
  });

  afterEach(() => {
    engine.dispose();
  });

  it('should initialize successfully', () => {
    expect(engine.isInitialized).toBe(true);
  });

  it('should load policies', async () => {
    const count = await engine.loadPolicies(policiesCsv);
    expect(count).toBeGreaterThan(0);
    expect(engine.hasPolicies).toBe(true);
  });

  it('should run chunks with deterministic results', async () => {
    await engine.loadPolicies(policiesCsv);
    await engine.loadAssumptions(assumptions);

    const result1 = await engine.runChunk({ ...config, seed: 42 });
    const result2 = await engine.runChunk({ ...config, seed: 42 });

    // Same seed should produce same results
    expect(result1.scenarioNpvs).toEqual(result2.scenarioNpvs);
  });
});
```
