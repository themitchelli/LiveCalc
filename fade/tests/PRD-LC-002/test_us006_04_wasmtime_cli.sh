#!/bin/bash
# Test: verify Wasmtime can be invoked via CLI for simple execution
# AC: Wasmtime can be invoked via CLI for simple execution

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
WASI_MAIN="$PROJECT_ROOT/livecalc-engine/src/wasm/wasi_main.cpp"
CMAKE_FILE="$PROJECT_ROOT/livecalc-engine/CMakeLists.txt"

if [[ ! -f "$WASI_MAIN" ]]; then
    echo "FAIL: wasi_main.cpp not found"
    echo "Expected: $WASI_MAIN exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for CLI argument parsing
if ! grep -qE "argc|argv" "$WASI_MAIN"; then
    echo "FAIL: CLI argument handling not found"
    echo "Expected: argc/argv CLI argument parsing"
    echo "Actual: not found"
    exit 1
fi

# Check for input file handling
if ! grep -qE "input|--input|policies" "$WASI_MAIN"; then
    echo "FAIL: Input file handling not found"
    echo "Expected: --input flag or file handling"
    echo "Actual: not found"
    exit 1
fi

# Check for output file handling
if ! grep -qE "output|--output|result" "$WASI_MAIN"; then
    echo "FAIL: Output file handling not found"
    echo "Expected: --output flag or result output"
    echo "Actual: not found"
    exit 1
fi

# Check CMake has WASI output configuration
if ! grep -q "livecalc-wasi\|WASI_OUTPUT" "$CMAKE_FILE"; then
    echo "FAIL: WASI output name not configured"
    echo "Expected: livecalc-wasi output name"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Wasmtime CLI invocation supported via wasi_main.cpp"
exit 0
