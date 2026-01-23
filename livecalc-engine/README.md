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
