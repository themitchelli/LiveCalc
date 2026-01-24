#!/bin/bash
# Test: verify LiveCalcEngine class wraps WASM module initialization
# AC: LiveCalcEngine class wraps WASM module initialization

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
ENGINE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: engine.ts not found"
    echo "Expected: $ENGINE_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for LiveCalcEngine class definition
if ! grep -q "export class LiveCalcEngine" "$ENGINE_FILE"; then
    echo "FAIL: LiveCalcEngine class not exported"
    echo "Expected: export class LiveCalcEngine"
    echo "Actual: not found in engine.ts"
    exit 1
fi

# Check for WASM module property
if ! grep -q "private module:" "$ENGINE_FILE"; then
    echo "FAIL: WASM module property not found"
    echo "Expected: private module property in LiveCalcEngine"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: LiveCalcEngine class wraps WASM module"
exit 0
