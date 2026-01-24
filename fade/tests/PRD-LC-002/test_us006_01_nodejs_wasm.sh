#!/bin/bash
# Test: verify same .wasm binary runs in Node.js 18+ without modification
# AC: Same .wasm binary runs in Node.js 18+ without modification

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
WASM_FILE="$PROJECT_ROOT/livecalc-engine/build-wasm/livecalc.wasm"
CMAKE_FILE="$PROJECT_ROOT/livecalc-engine/CMakeLists.txt"
PACKAGE_JSON="$PROJECT_ROOT/livecalc-engine/js/package.json"

# Check WASM binary exists
if [[ ! -f "$WASM_FILE" ]]; then
    echo "FAIL: livecalc.wasm not found"
    echo "Expected: $WASM_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check CMakeLists.txt configures for node environment
if ! grep -q 'ENVIRONMENT.*node' "$CMAKE_FILE"; then
    echo "FAIL: WASM not configured for node environment"
    echo "Expected: ENVIRONMENT includes 'node'"
    echo "Actual: not found"
    exit 1
fi

# Check package.json specifies Node.js 18+ requirement
if ! grep -q '"node": ">=' "$PACKAGE_JSON"; then
    echo "FAIL: Node.js version requirement not specified"
    echo "Expected: node >= version in engines"
    echo "Actual: not found"
    exit 1
fi

# Check for Node.js 18+ requirement
if ! grep -q '"node":.*18' "$PACKAGE_JSON"; then
    echo "FAIL: Node.js 18+ requirement not found"
    echo "Expected: node >= 18.0.0"
    echo "Actual: different version"
    exit 1
fi

echo "PASS: WASM configured for Node.js 18+ compatibility"
exit 0
