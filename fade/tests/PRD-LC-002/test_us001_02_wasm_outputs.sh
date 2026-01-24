#!/bin/bash
# Test: verify Emscripten build produces livecalc.js + livecalc.wasm
# AC: Emscripten build produces: livecalc.js + livecalc.wasm

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
BUILD_DIR="$PROJECT_ROOT/livecalc-engine/build-wasm"

# Check for WASM binary
if [[ ! -f "$BUILD_DIR/livecalc.wasm" ]]; then
    echo "FAIL: livecalc.wasm not found in build-wasm directory"
    echo "Expected: $BUILD_DIR/livecalc.wasm exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for JS wrapper (note: output is .mjs for ES6 module support)
if [[ ! -f "$BUILD_DIR/livecalc.mjs" ]]; then
    echo "FAIL: livecalc.mjs not found in build-wasm directory"
    echo "Expected: $BUILD_DIR/livecalc.mjs exists"
    echo "Actual: file not found"
    exit 1
fi

echo "PASS: Emscripten build produces livecalc.mjs and livecalc.wasm"
exit 0
