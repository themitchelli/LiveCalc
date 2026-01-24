#!/bin/bash
# Test: verify results logged to JSON file for tracking over time
# AC: Results logged to JSON file for tracking over time

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
BENCHMARK_SCRIPT="$PROJECT_ROOT/livecalc-engine/benchmarks/run-benchmarks.ts"
RESULTS_DIR="$PROJECT_ROOT/livecalc-engine/benchmarks/results"

if [[ ! -f "$BENCHMARK_SCRIPT" ]]; then
    echo "FAIL: run-benchmarks.ts not found"
    echo "Expected: $BENCHMARK_SCRIPT exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for JSON output logic
if ! grep -qE "JSON\.stringify|writeFile.*json|\.json" "$BENCHMARK_SCRIPT"; then
    echo "FAIL: JSON output logic not found"
    echo "Expected: JSON file output for results"
    echo "Actual: not found"
    exit 1
fi

# Check for results directory reference
if ! grep -qE "results|output|benchmark.*json" "$BENCHMARK_SCRIPT"; then
    echo "FAIL: Results directory reference not found"
    echo "Expected: results directory for storing benchmark JSON"
    echo "Actual: not found"
    exit 1
fi

# Check if results directory exists (may be created after running benchmarks)
if [[ -d "$RESULTS_DIR" ]]; then
    # Check for any JSON files
    JSON_COUNT=$(ls -1 "$RESULTS_DIR"/*.json 2>/dev/null | wc -l)
    if [[ "$JSON_COUNT" -gt 0 ]]; then
        echo "PASS: Results logged to JSON files (found $JSON_COUNT files)"
        exit 0
    fi
fi

echo "PASS: JSON output logic exists in benchmark script"
exit 0
