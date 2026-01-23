# LiveCalc Engine

A C++ projection engine for actuarial calculations, designed to compile to WASM for browser and server execution.

## Building

```bash
cd livecalc-engine
mkdir build && cd build
cmake ..
make
```

## Running Tests

```bash
cd build
ctest --output-on-failure
```

Or run the test executable directly:

```bash
./tests
```

## Usage

```bash
./livecalc-engine
```

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
