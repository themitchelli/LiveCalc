# LiveCalc Go/No-Go Demo Walkthrough

**5-10 Minute Live Demonstration**

This walkthrough demonstrates LiveCalc's core capabilities: high-performance projection, Python extensibility, multi-engine orchestration, and auditable assumption governance.

---

## Pre-Demo Setup (Done Once)

```bash
cd livecalc-demo

# 1. Generate demo data (if not already done)
./scripts/setup_demo_data.sh

# 2. Verify data files exist
ls -lh data/policies_1m.parquet data/scenarios_1k.npy

# 3. Test benchmark (quick version)
cd ../livecalc-engine/build && ./benchmark
```

---

## Demo Script (10 Minutes)

### Part 1: Horsepower Demonstration (3 minutes)

**Show the projection benchmark:**

```bash
cd livecalc-demo
./scripts/run_projection_benchmark.sh
```

**Commentary:**
> "LiveCalc processes 100,000 policies × 1,000 scenarios in 5.9 seconds natively on standard hardware. That's 16.8 million projections per second. Extrapolating linearly, 1 million policies would complete in ~59 seconds - well under our 120-second target."

**Key Points:**
- No GPU required
- Native C++ performance
- Cost-effective: ~£80 hardware (Raspberry Pi 5) vs. cloud pricing
- Calculations: 40 billion year-steps for 1M × 1K × 40 years

**Show the results:**

```bash
cat results/benchmark_analysis.json | jq .extrapolated_1m_policies
```

---

### Part 2: Python Extensibility (2 minutes)

**Show the Python UDF:**

```bash
cat udfs/smoker_adjustment.py | head -60
```

**Commentary:**
> "Actuaries can write Python functions that execute during projection. This UDF applies a 1.2x mortality loading for smokers. The Python code integrates seamlessly with the C++ engine - no recompilation needed."

**Test the UDF:**

```bash
python3 udfs/smoker_adjustment.py
```

**Output shows:**
- Young smoker: +20% mortality
- Non-smoker: unchanged
- Demonstrates business logic flexibility

---

### Part 3: Demo Data Quality (2 minutes)

**Show policy data:**

```bash
python3 << 'EOF'
import pyarrow.parquet as pq
df = pq.read_table('data/policies_1m.parquet').to_pandas()
print(f"Policies: {len(df):,}")
print(f"\nAge distribution: {df['age'].min()}-{df['age'].max()} (mean: {df['age'].mean():.1f})")
print(f"\nProduct mix:")
print(f"  Term Life:   {(df['product_type']==0).sum():>7,} ({(df['product_type']==0).sum()/len(df)*100:.1f}%)")
print(f"  Whole Life:  {(df['product_type']==1).sum():>7,} ({(df['product_type']==1).sum()/len(df)*100:.1f}%)")
print(f"  Endowment:   {(df['product_type']==2).sum():>7,} ({(df['product_type']==2).sum()/len(df)*100:.1f}%)")
print(f"\nSmokers: {(df['underwriting_class']==1).sum():,} ({(df['underwriting_class']==1).sum()/len(df)*100:.1f}%)")
print(f"\nSum assured: £{df['sum_assured'].min():,.0f} - £{df['sum_assured'].max():,.0f}")
print(f"  Mean: £{df['sum_assured'].mean():,.0f}")
EOF
```

**Commentary:**
> "Our demo uses realistic data: 1 million policies with proper age distributions, product mix (70% term, 20% whole, 10% endowment), and 15% smoker rate matching UK actuarial standards."

---

### Part 4: Multi-Engine Architecture (2 minutes)

**Show pipeline configuration:**

```bash
cat config/dag_full_pipeline.json | jq .nodes
```

**Commentary:**
> "LiveCalc's modular architecture supports multi-engine workflows:
>
> 1. **ESG Engine** (Python) - Generates 1,000 economic scenarios
> 2. **Projection Engine** (C++) - Projects 1M policies with Python UDFs
> 3. **Solver Engine** (Python) - Optimizes premium to target NPV
>
> All engines resolve assumptions independently from the Assumptions Manager. Data flows via SharedArrayBuffer - zero-copy, high performance."

---

### Part 5: Cost Advantage (1 minute)

**Show cost analysis:**

```bash
cat docs/cost_analysis.md | head -40
```

**Commentary:**
> "Cost per calculation on our hardware: ~£5e-9 (5 billionths of a pound). That's orders of magnitude cheaper than cloud alternatives.
>
> For 1 million policies × 1,000 scenarios running hourly:
> - LiveCalc (Pi 5): £0.002 per run = £1.46/month
> - Azure Batch estimate: ~£50-100/month
> - GPU vendors: Even higher
>
> Better engineering beats specialized hardware."

---

## Demo Fallback

If live execution fails (network, build issues):

**Show pre-recorded results:**

```bash
# Show baseline benchmark
cat results/benchmark_baseline.txt

# Show analysis
cat results/benchmark_analysis.json | jq

# Walk through code
cat udfs/smoker_adjustment.py
```

---

## Post-Demo Q&A Prep

**Common Questions:**

**Q: "How does it compare to GPU solutions?"**
A: We don't need GPUs. Our CPU-optimized code with SIMD hits 16.8M proj/sec. GPUs have higher peak but cost 10-100x more. For actuarial workloads with branching logic, CPUs are more cost-effective.

**Q: "Can it scale beyond 1M policies?"**
A: Yes. The engine is memory-bound, not compute-bound. With 32GB RAM, we can handle 5-10M policies. For larger, distribute across nodes.

**Q: "What about model governance?"**
A: Every calculation tracks exact assumption versions from Assumptions Manager. Full audit trail: who approved, when, what changed. Results are reproducible with identical assumptions.

**Q: "Python UDF performance overhead?"**
A: Target <10%. We embed Python directly (not Pyodide). Hot-path stays in C++, Python only for specific adjustments. If UDF becomes bottleneck, translate to C++.

**Q: "Cloud deployment?"**
A: Native binary runs anywhere: Docker, Kubernetes, edge devices, Raspberry Pi. WASM version runs in browser. Azure Batch integration for massive scale.

---

## Files Reference

- **Demo data:** `data/policies_1m.parquet`, `data/scenarios_1k.npy`
- **Benchmarks:** `results/benchmark_*.{txt,json}`
- **Python UDF:** `udfs/smoker_adjustment.py`
- **Pipeline config:** `config/dag_full_pipeline.json`
- **Cost analysis:** `docs/cost_analysis.md`
- **Comparison:** `docs/comparison_report.md`

---

**Demo Duration:** 5-10 minutes (flexible)

**Equipment:** Laptop with terminal, pre-generated data, pre-built engine

**Backup:** Pre-recorded output files if live demo fails
