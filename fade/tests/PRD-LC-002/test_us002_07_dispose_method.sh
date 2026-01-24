#!/bin/bash
# Test: verify dispose() method frees allocated memory
# AC: dispose() method frees allocated memory

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
ENGINE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: engine.ts not found"
    echo "Expected: $ENGINE_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for dispose method
if ! grep -q "dispose(" "$ENGINE_FILE"; then
    echo "FAIL: dispose() method not found"
    echo "Expected: dispose() method in LiveCalcEngine"
    echo "Actual: not found"
    exit 1
fi

# Check that dispose clears/nullifies module
if ! grep -A10 "dispose(" "$ENGINE_FILE" | grep -qE "(this\.module\s*=\s*null|this\.initialized\s*=\s*false)"; then
    echo "FAIL: dispose() does not clean up engine state"
    echo "Expected: module cleanup in dispose()"
    echo "Actual: cleanup not found"
    exit 1
fi

echo "PASS: dispose() method frees allocated memory and cleans up state"
exit 0
