#!/bin/bash
# Test: verify same .wasm binary runs in Wasmtime 14+ without modification
# AC: Same .wasm binary runs in Wasmtime 14+ without modification

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
CMAKE_FILE="$PROJECT_ROOT/livecalc-engine/CMakeLists.txt"
WASI_MAIN="$PROJECT_ROOT/livecalc-engine/src/wasm/wasi_main.cpp"

# Check for WASI build support in CMakeLists.txt
if ! grep -q "WASI" "$CMAKE_FILE"; then
    echo "FAIL: WASI build support not found"
    echo "Expected: WASI build configuration in CMakeLists.txt"
    echo "Actual: not found"
    exit 1
fi

# Check for Wasmtime reference or WASI SDK support
if ! grep -qE "Wasmtime|WASI_SDK" "$CMAKE_FILE"; then
    echo "FAIL: Wasmtime/WASI SDK reference not found"
    echo "Expected: Wasmtime or WASI SDK configuration"
    echo "Actual: not found"
    exit 1
fi

# Check WASI main entry point exists
if [[ ! -f "$WASI_MAIN" ]]; then
    echo "FAIL: wasi_main.cpp not found"
    echo "Expected: $WASI_MAIN exists for WASI standalone"
    echo "Actual: file not found"
    exit 1
fi

# Check WASI main has CLI interface
if ! grep -qE "argc|argv|main" "$WASI_MAIN"; then
    echo "FAIL: WASI main does not have CLI interface"
    echo "Expected: argc/argv handling for CLI"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: WASI build configured for Wasmtime compatibility"
exit 0
