#!/bin/bash
# Test: verify async initialize() method loads and compiles WASM
# AC: async initialize() method loads and compiles WASM

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
ENGINE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: engine.ts not found"
    echo "Expected: $ENGINE_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for async initialize method
if ! grep -q "async initialize(" "$ENGINE_FILE"; then
    echo "FAIL: async initialize() method not found"
    echo "Expected: async initialize() method in LiveCalcEngine"
    echo "Actual: not found"
    exit 1
fi

# Check that initialize returns Promise<void>
if ! grep -q "initialize.*Promise<void>" "$ENGINE_FILE"; then
    echo "FAIL: initialize() does not return Promise<void>"
    echo "Expected: initialize(...): Promise<void>"
    echo "Actual: different return type"
    exit 1
fi

# Check that module is assigned during initialization
if ! grep -q "this.module = await" "$ENGINE_FILE"; then
    echo "FAIL: initialize() does not await module creation"
    echo "Expected: this.module = await createModule()"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: async initialize() method loads and compiles WASM"
exit 0
