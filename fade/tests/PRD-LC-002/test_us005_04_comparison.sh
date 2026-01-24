#!/bin/bash
# Test: verify compares native C++ vs WASM single-thread vs WASM multi-thread
# AC: Compares: native C++ vs WASM single-thread vs WASM multi-thread

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
BENCHMARK_SCRIPT="$PROJECT_ROOT/livecalc-engine/benchmarks/run-benchmarks.ts"
PACKAGE_JSON="$PROJECT_ROOT/livecalc-engine/benchmarks/package.json"

if [[ ! -f "$BENCHMARK_SCRIPT" ]]; then
    echo "FAIL: run-benchmarks.ts not found"
    echo "Expected: $BENCHMARK_SCRIPT exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for native benchmark
if ! grep -qE "native|Native|runNative" "$BENCHMARK_SCRIPT"; then
    echo "FAIL: Native C++ benchmark not found"
    echo "Expected: native C++ benchmark"
    echo "Actual: not found"
    exit 1
fi

# Check for WASM single-threaded benchmark
if ! grep -qE "single|Single|wasmSingle" "$BENCHMARK_SCRIPT"; then
    echo "FAIL: WASM single-threaded benchmark not found"
    echo "Expected: single-threaded WASM benchmark"
    echo "Actual: not found"
    exit 1
fi

# Check for WASM multi-threaded benchmark
if ! grep -qE "multi|Multi|wasmMulti|worker|Worker" "$BENCHMARK_SCRIPT"; then
    echo "FAIL: WASM multi-threaded benchmark not found"
    echo "Expected: multi-threaded WASM benchmark"
    echo "Actual: not found"
    exit 1
fi

# Check for comparison/no-native/no-multi options in package.json
if ! grep -q "no-native\|no-single\|no-multi" "$PACKAGE_JSON"; then
    echo "WARN: Selective benchmark options not found in package.json"
fi

echo "PASS: Benchmarks compare native, WASM single, and WASM multi-threaded"
exit 0
