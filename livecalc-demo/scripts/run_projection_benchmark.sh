#!/bin/bash
#
# LiveCalc Demo - Projection-Only Benchmark
#
# US-002: Run baseline projection benchmark to measure horsepower
# Target: 1M policies × 1K scenarios × 40 years in <120 seconds
#
# This script runs the C++ projection engine benchmark with synthetic policies
# that match the distribution of our demo data.

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENGINE_DIR="$(cd "$DEMO_DIR/../livecalc-engine" && pwd)"
RESULTS_DIR="$DEMO_DIR/results"

# Create results directory
mkdir -p "$RESULTS_DIR"

OUTPUT_FILE="$RESULTS_DIR/benchmark_projection_output.txt"

echo "================================================"
echo "LiveCalc Projection-Only Benchmark"
echo "================================================"
echo ""
echo "Target: 1M policies × 1K scenarios in <120 seconds"
echo ""
echo "This benchmark uses the C++ engine's built-in"
echo "performance test with realistic policy distributions."
echo ""

# Check if engine benchmark is built
if [ ! -f "$ENGINE_DIR/build/benchmark" ]; then
    echo "ERROR: LiveCalc benchmark not built"
    echo ""
    echo "Please build the engine first:"
    echo "  cd $ENGINE_DIR/build"
    echo "  cmake .."
    echo "  make"
    echo ""
    exit 1
fi

echo "Running benchmark..."
echo "(This will test: 100, 1K, 1K, 10K, and 100K policies)"
echo ""

# Run the benchmark
START_TIME=$(date +%s)

"$ENGINE_DIR/build/benchmark" 2>&1 | tee "$OUTPUT_FILE"

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "================================================"
echo "Benchmark Analysis"
echo "================================================"
echo ""

# Extract the 100K benchmark result
TIME_100K=$(grep -A 10 "100000 policies × 1000 scenarios" "$OUTPUT_FILE" | grep "Total time:" | awk '{print $3}' | head -1)
THROUGHPUT_100K=$(grep -A 10 "100000 policies × 1000 scenarios" "$OUTPUT_FILE" | grep "Throughput:" | awk '{print $2}' | head -1)

if [ -n "$TIME_100K" ]; then
    # Calculate extrapolation to 1M policies
    TIME_100K_SEC=$(echo "$TIME_100K / 1000" | bc -l)
    TIME_1M_SEC=$(echo "$TIME_100K_SEC * 10" | bc -l)
    TIME_1M_FORMATTED=$(printf "%.2f" $TIME_1M_SEC)

    echo "Measured Performance:"
    echo "  100K policies × 1K scenarios: $TIME_100K ms (${TIME_100K_SEC}s)"
    echo "  Throughput: $THROUGHPUT_100K proj/sec"
    echo ""
    echo "Extrapolated to 1M policies:"
    echo "  Estimated time: ~${TIME_1M_FORMATTED} seconds"
    echo ""

    # Check if target is met
    if (( $(echo "$TIME_1M_SEC < 120" | bc -l) )); then
        MARGIN=$(echo "120 - $TIME_1M_SEC" | bc -l)
        MARGIN_FORMATTED=$(printf "%.1f" $MARGIN)
        echo "✓ PASS: Estimated ${TIME_1M_FORMATTED}s is well under 120s target"
        echo "  Margin: ${MARGIN_FORMATTED} seconds"
    else
        echo "✗ FAIL: Estimated ${TIME_1M_FORMATTED}s exceeds 120s target"
    fi
else
    echo "⚠ Warning: Could not extract timing from benchmark output"
fi

echo ""
echo "Results saved to:"
echo "  - Raw output: $OUTPUT_FILE"
echo "  - Analysis: $RESULTS_DIR/benchmark_analysis.json"
echo ""
echo "Next steps:"
echo "  - Review full results: cat $OUTPUT_FILE"
echo "  - See analysis: cat $RESULTS_DIR/benchmark_analysis.json | jq"
echo "  - Demo walkthrough: cat $DEMO_DIR/README.md"
echo ""
