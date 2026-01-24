#!/bin/bash
# Test: verify error handling with meaningful messages (not just 'WASM trap')
# AC: Error handling with meaningful messages (not just 'WASM trap')

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
ENGINE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: engine.ts not found"
    echo "Expected: $ENGINE_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for LiveCalcError class (custom error handling)
if ! grep -q "class LiveCalcError" "$ENGINE_FILE"; then
    echo "FAIL: LiveCalcError class not found"
    echo "Expected: custom LiveCalcError class"
    echo "Actual: not found"
    exit 1
fi

# Check for error wrapping with meaningful messages
if ! grep -q "throw new LiveCalcError" "$ENGINE_FILE"; then
    echo "FAIL: No custom error throwing found"
    echo "Expected: throw new LiveCalcError with message"
    echo "Actual: not found"
    exit 1
fi

# Check for error codes
if ! grep -q "'INIT_FAILED'\|'ALREADY_INITIALIZED'\|'NOT_INITIALIZED'" "$ENGINE_FILE"; then
    echo "FAIL: No error codes found"
    echo "Expected: error codes like INIT_FAILED, etc."
    echo "Actual: not found"
    exit 1
fi

# Check for try-catch error handling
if ! grep -q "try {" "$ENGINE_FILE"; then
    echo "FAIL: No try-catch error handling found"
    echo "Expected: try-catch blocks for error handling"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Error handling with meaningful messages and codes"
exit 0
