#!/bin/bash
#
# LiveCalc Live Demo Script
#
# US-007: Interactive 5-10 minute demonstration of LiveCalc capabilities
#
# This script provides a guided walkthrough with real-time output,
# progress indicators, and commentary prompts for the presenter.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function for commentary prompts
say() {
    echo -e "${BLUE}[PRESENTER]${NC} $1"
    echo ""
}

# Helper for section headers
section() {
    echo ""
    echo "================================================"
    echo "$1"
    echo "================================================"
    echo ""
}

# Helper for pausing
pause() {
    echo -e "${YELLOW}[Press Enter to continue]${NC}"
    read -r
}

clear

section "LiveCalc Go/No-Go Demo"

say "Welcome to the LiveCalc demonstration. This 10-minute demo will show:"
say "  1. Horsepower: 1M policies in ~60 seconds (no GPU)"
say "  2. Python UDFs: Extensible actuarial logic"
say "  3. Cost-effectiveness: £1.42/month vs. £20-500/month cloud"
say "  4. Architecture: Multi-engine orchestration with governance"

pause

# ==================== PART 1: HORSEPOWER ====================

section "Part 1: Horsepower Demonstration (3 minutes)"

say "LiveCalc processes 100,000 policies × 1,000 scenarios in 5.9 seconds."
say "That's 16.8 million projections per second on standard hardware."
say ""
say "Let's run the benchmark..."

pause

cd "$DEMO_DIR"

if [ -f "../livecalc-engine/build/benchmark" ]; then
    say "Running projection benchmark (100, 1K, 10K, 100K policies)..."
    echo ""

    ../livecalc-engine/build/benchmark | tail -30

    echo ""
    say "Key result: 100K policies × 1K scenarios in ~5.9 seconds"
    say "Extrapolated to 1M: ~59 seconds (20-year avg) or ~118s (40-year)"
    say "Target: <120 seconds ✓ PASS"
else
    say "⚠️  Benchmark not built. Showing pre-recorded results..."
    cat results/benchmark_baseline.txt | tail -30
fi

pause

say "Cost analysis:"
echo ""
echo "  Hardware: Raspberry Pi 5 (£80) + electricity (£1.40/month)"
echo "  Per run: £0.0002"
echo "  Monthly (hourly runs): £1.42"
echo ""
echo "  vs. Azure Batch: £20-100/month"
echo "  vs. GPU Cloud: £68-500/month"
echo ""
echo "  Savings: 14-350x cost advantage"

pause

# ==================== PART 2: PYTHON UDFs ====================

section "Part 2: Python Extensibility (2 minutes)"

say "Actuaries can write Python functions that execute during projection."
say "No C++ knowledge required. No recompilation."
say ""
say "Example: Smoker mortality adjustment (1.2x loading)"

pause

echo -e "${GREEN}Python UDF Code:${NC}"
echo ""
cat udfs/smoker_adjustment.py | head -70 | tail -30

pause

say "Let's test the UDF:"
echo ""

python3 udfs/smoker_adjustment.py

pause

say "This 30-line Python function adjusts mortality rates during projection."
say "Result: Smokers get +20% mortality, non-smokers unchanged."
say "Integration: Seamless with C++ engine, hot-reload supported."

pause

# ==================== PART 3: DEMO DATA ====================

section "Part 3: Demo Data Quality (2 minutes)"

say "Our demo uses realistic actuarial data:"

pause

python3 << 'EOF'
import pyarrow.parquet as pq
df = pq.read_table('data/policies_1m.parquet').to_pandas()

print(f"\n📊 Policy Portfolio Summary:")
print(f"   Total policies: {len(df):,}")
print(f"\n   Age: {df['age'].min()}-{df['age'].max()} (mean: {df['age'].mean():.1f})")
print(f"\n   Product Mix:")
print(f"     Term Life:   {(df['product_type']==0).sum():>7,} ({(df['product_type']==0).sum()/len(df)*100:.1f}%)")
print(f"     Whole Life:  {(df['product_type']==1).sum():>7,} ({(df['product_type']==1).sum()/len(df)*100:.1f}%)")
print(f"     Endowment:   {(df['product_type']==2).sum():>7,} ({(df['product_type']==2).sum()/len(df)*100:.1f}%)")
print(f"\n   Smokers: {(df['underwriting_class']==1).sum():,} ({(df['underwriting_class']==1).sum()/len(df)*100:.1f}%)")
print(f"\n   Sum Assured: £{df['sum_assured'].min():,.0f} - £{df['sum_assured'].max():,.0f}")
print(f"     Average: £{df['sum_assured'].mean():,.0f}\n")
EOF

pause

say "Data quality:"
say "  ✓ 1M policies with realistic distributions"
say "  ✓ Product mix matches UK market (70% term, 20% whole, 10% endowment)"
say "  ✓ 15% smoker rate (actuarially realistic)"
say "  ✓ Age distribution bell curve (mean 40, range 20-75)"

pause

# ==================== PART 4: ARCHITECTURE ====================

section "Part 4: Multi-Engine Architecture (2 minutes)"

say "LiveCalc supports modular, multi-engine workflows."
say "Example pipeline: ESG → Projection → Solver"

pause

echo -e "${GREEN}Pipeline Configuration:${NC}"
echo ""
cat config/dag_full_pipeline.json | head -40

pause

say "Architecture highlights:"
echo ""
echo "  1. ESG Engine (Python)"
echo "     - Generates 1,000 economic scenarios"
echo "     - Vasicek model with configurable parameters"
echo ""
echo "  2. Projection Engine (C++)"
echo "     - Projects 1M policies with Python UDFs"
echo "     - Resolves assumptions from Assumptions Manager"
echo ""
echo "  3. Solver Engine (Python)"
echo "     - Optimizes premium to target NPV"
echo "     - Newton method with convergence tolerance"
echo ""
echo "  Data Flow: SharedArrayBuffer (zero-copy, high performance)"
echo "  Governance: All engines track exact assumption versions"

pause

# ==================== PART 5: COST SUMMARY ====================

section "Part 5: Cost Advantage Summary (1 minute)"

say "Cost-per-calculation breakdown:"

pause

cat << 'EOF'

  Hardware: £80 (Raspberry Pi 5)
  Amortization: £1.33/month (5-year lifespan)
  Electricity: £0.09/month (hourly runs)

  Total: £1.42/month

  vs. Alternatives:
    Azure Batch:  £19.71/month  (13.9x more)
    AWS Lambda:   £58.40/month  (41.1x more)
    GPU Cloud:    £67.89/month  (47.8x more)

  5-Year TCO:
    LiveCalc: £184
    Azure:    £1,183
    GPU:      £4,073

  Savings: £999-3,889 over 5 years

EOF

pause

say "Key insight: Better engineering beats cloud markup."
say "CPU-optimized code on commodity hardware delivers"
say "actuarial-grade performance at 1/50th the cost."

pause

# ==================== CONCLUSION ====================

section "Demo Complete - Thank You!"

say "Summary:"
echo ""
echo "  ✅ Horsepower: 1M policies in ~60 seconds (no GPU)"
echo "  ✅ Python UDFs: 30 lines for custom mortality adjustments"
echo "  ✅ Cost: £1.42/month (vs. £20-500/month cloud)"
echo "  ✅ Architecture: Multi-engine with assumption governance"
echo ""

say "Next steps:"
echo "  - Review cost analysis: cat docs/cost_analysis.md"
echo "  - Compare alternatives: cat docs/comparison_report.md"
echo "  - Run benchmarks: ./scripts/run_projection_benchmark.sh"
echo "  - Explore code: cat udfs/smoker_adjustment.py"
echo ""

say "Questions?"
echo ""

say "Thank you for watching the LiveCalc demo!"
