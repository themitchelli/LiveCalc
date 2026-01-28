# LiveCalc Go/No-Go Demo

**Proof of Horsepower & Architecture**

This demo proves LiveCalc's core thesis: pluggable calculation engines (C++ + Python) that scale without GPU, resolve assumptions independently, and deliver cost-effective horsepower.

## What This Demo Shows

1. **1M Policy Projection** in <2 minutes (1M policies × 1K scenarios × 40 years)
2. **Python UDF Execution** during projection (smoker mortality adjustment)
3. **Multi-Engine Orchestration** (ESG → Projection → Solver)
4. **Auditable Assumption Governance** from Assumptions Manager
5. **Cost-Per-Calculation Advantage** over cloud/GPU alternatives

## Quick Start

### Prerequisites

```bash
# Python dependencies
pip install numpy pyarrow pandas

# Verify dependencies
python3 -c "import numpy, pyarrow, pandas; print('✓ Dependencies OK')"
```

### Generate Demo Data

```bash
# Generate all demo data (1M policies + 1K scenarios)
# Estimated time: 30-60 seconds
./scripts/setup_demo_data.sh
```

This creates:
- `data/policies_1m.parquet` (25.8 MB) - 1,000,000 realistic policies
- `data/scenarios_1k.npy` (0.6 MB) - 1,000 economic scenarios (10 outer × 100 inner)
- `data/assumptions/` - Mortality, lapse, and expense assumptions

### Run Benchmarks

```bash
# Projection-only benchmark (baseline horsepower test)
./scripts/run_projection_benchmark.sh

# Full pipeline (ESG → Projection → Solver)
./scripts/run_full_pipeline.sh

# Live demo walkthrough
./scripts/demo_script.sh
```

## Demo Data Details

### Policies (1M records)

Generated with realistic distributions:

| Attribute | Details |
|-----------|---------|
| **Age** | 20-75 (bell curve centered at 40) |
| **Gender** | ~50/50 male/female split |
| **Smoker Status** | ~15% smokers (realistic rate) |
| **Products** | Term Life (70%), Whole Life (20%), Endowment (10%) |
| **Sum Assured** | £100K - £1M (based on age and product) |
| **Premium** | £360 - £9,332 annual (actuarially calculated) |
| **Term** | 10-40 years for term products, 99 for whole life |

**File:** `data/policies_1m.parquet` (25.8 MB, Snappy compression)

### Scenarios (1K scenarios)

Economic scenarios generated using Vasicek ESG model:

| Parameter | Value |
|-----------|-------|
| **Outer Paths** | 10 (deterministic skeleton scenarios) |
| **Inner Paths** | 100 per outer (Monte Carlo stochastic) |
| **Total Scenarios** | 1,000 |
| **Projection Years** | 50 |
| **Mean Interest Rate** | 8.20% |
| **Interest Rate Range** | 0.10% - 89.11% |

**File:** `data/scenarios_1k.npy` (0.6 MB)

### Assumptions

Pre-loaded assumption tables:

- **Mortality** (`data/assumptions/mortality_demo.csv`) - UK-based rates, Gompertz-Makeham formula
- **Lapse** (`data/assumptions/lapse_demo.csv`) - Realistic lapse curve (high early years, decreasing over time)
- **Expenses** (`data/assumptions/expenses_demo.json`) - Per-policy and % of premium expenses

## Data Regeneration

To regenerate demo data with different parameters:

### Generate Custom Policies

```bash
cd data
python3 generate_policies.py \
    --num-policies 100000 \
    --seed 123 \
    --output policies_custom.parquet
```

**Options:**
- `--num-policies`: Number of policies to generate (default: 1,000,000)
- `--seed`: Random seed for reproducibility (default: 42)
- `--output`: Output file path (default: policies_1m.parquet)

### Generate Custom Scenarios

```bash
cd data
python3 ../scripts/generate_scenarios.py \
    --outer-paths 5 \
    --inner-paths 200 \
    --projection-years 40 \
    --seed 123 \
    --output scenarios_custom.npy
```

**Options:**
- `--outer-paths`: Number of outer scenario paths (3-10, default: 10)
- `--inner-paths`: Number of inner paths per outer (100-10000, default: 100)
- `--projection-years`: Number of years to project (1-100, default: 50)
- `--seed`: Random seed for reproducibility (default: 42)
- `--output`: Output file path (default: scenarios_1k.npy)

## Directory Structure

```
livecalc-demo/
├── README.md                          # This file
├── data/                              # Generated demo data
│   ├── generate_policies.py          # Policy generation script
│   ├── policies_1m.parquet           # 1M policies (generated)
│   ├── scenarios_1k.npy              # 1K scenarios (generated)
│   ├── scenarios_1k_metadata.json    # Scenario metadata (generated)
│   └── assumptions/                  # Assumption files
│       ├── mortality_demo.csv        # Mortality rates
│       ├── lapse_demo.csv            # Lapse rates
│       └── expenses_demo.json        # Expense assumptions
├── scripts/                           # Demo execution scripts
│   ├── setup_demo_data.sh            # Generate all demo data
│   ├── run_projection_benchmark.sh   # Projection-only benchmark (TODO)
│   ├── run_full_pipeline.sh          # Full pipeline demo (TODO)
│   ├── demo_script.sh                # Live demo walkthrough (TODO)
│   ├── create_assumption_files.py    # Generate assumption files
│   └── generate_scenarios.py         # Scenario generation script
├── config/                            # Configuration files
│   ├── assumptions.json              # Assumptions Manager config
│   ├── esg_config.json              # ESG configuration (TODO)
│   ├── solver_config.json           # Solver configuration (TODO)
│   └── dag_full_pipeline.json       # Full pipeline DAG config (TODO)
├── udfs/                             # User-defined functions
│   └── smoker_adjustment.py         # Smoker mortality UDF (TODO)
├── results/                          # Demo results
│   └── sample_results.json          # Sample output (TODO)
└── docs/                             # Documentation
    ├── demo_walkthrough.md          # Step-by-step demo guide (TODO)
    ├── cost_analysis.md             # Cost comparison analysis (TODO)
    └── comparison_report.md         # LiveCalc vs. alternatives (TODO)
```

## Performance Targets

| Benchmark | Target | Notes |
|-----------|--------|-------|
| **Projection-only** | <120s | 1M policies × 1K scenarios × 40 years (Intel i7 equiv.) |
| **Python UDF overhead** | <10% | Smoker mortality adjustment vs. baseline |
| **Full pipeline** | <10 min | ESG (10s) → Projection (100s) → Solver (300s) |
| **Cost per calculation** | <1e-8 | Hardware amortization + electricity vs. cloud |

## Acceptance Criteria (US-001)

- ✅ 1,000,000 policies with realistic attributes (age 20-75, gender, smoker status, products)
- ✅ Policies distributed across segments (Term Life 70%, Whole Life 20%, Endowment 10%)
- ✅ 1,000 economic scenarios pre-generated using ESG (10 outer × 100 inner)
- ✅ Assumptions pre-loaded (mortality, lapse, expenses) in `data/assumptions/`
- ✅ Data format: Parquet for policies, NumPy for scenarios (efficient I/O)
- ✅ Documentation: This README with regeneration instructions

## Next Steps

1. **Run Projection Benchmark** (US-002) - Test baseline horsepower
2. **Add Python UDF** (US-003) - Demonstrate extensibility
3. **Full Pipeline Demo** (US-004) - Show multi-engine orchestration
4. **Cost Analysis** (US-006) - Calculate cost-per-calculation advantage

## References

- **PRD:** PRD-LC-011 - Go/No-Go Demo
- **Dependencies:**
  - PRD-LC-006-REFACTOR: Assumptions Manager Library
  - PRD-LC-001-REVISED: C++ Projection Engine
  - PRD-LC-007: Python ESG Engine
  - PRD-LC-008: Python Solver Engine
  - PRD-LC-010-REVISED: Modular Orchestration Layer

---

**Generated:** 2026-01-28
**Seed:** 42 (policies and scenarios)
**Author:** LiveCalc FADE Agent
