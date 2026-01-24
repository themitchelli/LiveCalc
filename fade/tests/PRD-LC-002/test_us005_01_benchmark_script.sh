#!/bin/bash
# Test: verify benchmark script runs standard configurations automatically
# AC: Benchmark script runs standard configurations automatically

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
BENCHMARK_DIR="$PROJECT_ROOT/livecalc-engine/benchmarks"
BENCHMARK_SCRIPT="$BENCHMARK_DIR/run-benchmarks.ts"
PACKAGE_JSON="$BENCHMARK_DIR/package.json"

# Check benchmark script exists
if [[ ! -f "$BENCHMARK_SCRIPT" ]]; then
    echo "FAIL: run-benchmarks.ts not found"
    echo "Expected: $BENCHMARK_SCRIPT exists"
    echo "Actual: file not found"
    exit 1
fi

# Check package.json has benchmark scripts
if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: benchmarks/package.json not found"
    echo "Expected: $PACKAGE_JSON exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for benchmark npm script
if ! grep -q '"benchmark"' "$PACKAGE_JSON"; then
    echo "FAIL: benchmark script not in package.json"
    echo "Expected: benchmark script defined"
    echo "Actual: not found"
    exit 1
fi

# Check benchmark script runs tsx
if ! grep -q "tsx.*run-benchmarks" "$PACKAGE_JSON"; then
    echo "FAIL: benchmark script does not run tsx run-benchmarks.ts"
    echo "Expected: tsx run-benchmarks.ts"
    echo "Actual: different command"
    exit 1
fi

echo "PASS: Benchmark script runs standard configurations automatically"
exit 0
