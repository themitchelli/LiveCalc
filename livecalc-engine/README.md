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
