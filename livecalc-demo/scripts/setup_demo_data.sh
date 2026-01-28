#!/bin/bash
#
# Setup Demo Data for LiveCalc Go/No-Go Demo
#
# This script generates all required demo data:
# - 1M realistic policies (Parquet)
# - 1K economic scenarios (NumPy)
# - Assumption files (CSV/JSON)
#
# Usage: ./setup_demo_data.sh

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$SCRIPT_DIR/../data" && pwd)"

echo "================================================"
echo "LiveCalc Demo Data Setup"
echo "================================================"
echo ""
echo "This will generate:"
echo "  - 1,000,000 policies (~30 MB Parquet)"
echo "  - 1,000 economic scenarios (~2 MB NumPy)"
echo "  - Assumption files (mortality, lapse, expenses)"
echo ""
echo "Estimated time: 30-60 seconds"
echo ""

# Check Python dependencies
echo "Checking dependencies..."
python3 -c "import numpy, pyarrow, pandas" 2>/dev/null || {
    echo "Error: Missing Python dependencies"
    echo ""
    echo "Please install required packages:"
    echo "  pip install numpy pyarrow pandas"
    echo ""
    exit 1
}

# Check ESG engine
if [ ! -f "$SCRIPT_DIR/../../livecalc-engines/python-esg/src/esg_engine.py" ]; then
    echo "Warning: ESG engine not found. Scenarios will not be generated."
    echo "         Complete PRD-LC-007 to enable scenario generation."
    ESG_AVAILABLE=false
else
    ESG_AVAILABLE=true
fi

echo "✓ Dependencies OK"
echo ""

# Step 1: Create assumption files
echo "[1/3] Creating assumption files..."
cd "$SCRIPT_DIR"
python3 create_assumption_files.py
echo ""

# Step 2: Generate policies
echo "[2/3] Generating 1M policies..."
cd "$DATA_DIR"
python3 "$SCRIPT_DIR/../data/generate_policies.py" \
    --num-policies 1000000 \
    --seed 42 \
    --output policies_1m.parquet

echo ""

# Step 3: Generate scenarios (if ESG available)
if [ "$ESG_AVAILABLE" = true ]; then
    echo "[3/3] Generating 1K scenarios..."
    cd "$DATA_DIR"
    python3 "$SCRIPT_DIR/generate_scenarios.py" \
        --outer-paths 10 \
        --inner-paths 100 \
        --projection-years 50 \
        --seed 42 \
        --output scenarios_1k.npy
else
    echo "[3/3] Skipping scenario generation (ESG engine not available)"
fi

echo ""
echo "================================================"
echo "✓ Demo Data Setup Complete!"
echo "================================================"
echo ""
echo "Generated files:"
echo "  - $DATA_DIR/policies_1m.parquet"
if [ "$ESG_AVAILABLE" = true ]; then
    echo "  - $DATA_DIR/scenarios_1k.npy"
    echo "  - $DATA_DIR/scenarios_1k_metadata.json"
fi
echo "  - $DATA_DIR/assumptions/mortality_demo.csv"
echo "  - $DATA_DIR/assumptions/lapse_demo.csv"
echo "  - $DATA_DIR/assumptions/expenses_demo.json"
echo ""
echo "Next steps:"
echo "  1. Run projection benchmark: ./scripts/run_projection_benchmark.sh"
echo "  2. View demo walkthrough: docs/demo_walkthrough.md"
echo ""
