#!/bin/bash
# Test: verify results returned as JavaScript object (not raw memory pointers)
# AC: Results returned as JavaScript object (not raw memory pointers)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
TYPES_FILE="$PROJECT_ROOT/livecalc-engine/js/src/types.ts"
ENGINE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/engine.ts"

if [[ ! -f "$TYPES_FILE" ]]; then
    echo "FAIL: types.ts not found"
    echo "Expected: $TYPES_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check ValuationResult interface exists
if ! grep -q "export interface ValuationResult" "$TYPES_FILE"; then
    echo "FAIL: ValuationResult interface not found"
    echo "Expected: export interface ValuationResult in types.ts"
    echo "Actual: not found"
    exit 1
fi

# Check it has statistics property (not pointer)
if ! grep -A10 "interface ValuationResult" "$TYPES_FILE" | grep -q "statistics:"; then
    echo "FAIL: ValuationResult does not have statistics property"
    echo "Expected: statistics property in ValuationResult"
    echo "Actual: not found"
    exit 1
fi

# Check it has executionTimeMs property
if ! grep -A10 "interface ValuationResult" "$TYPES_FILE" | grep -q "executionTimeMs:"; then
    echo "FAIL: ValuationResult does not have executionTimeMs property"
    echo "Expected: executionTimeMs property in ValuationResult"
    echo "Actual: not found"
    exit 1
fi

# Check engine extracts results from WASM (not returning raw pointers)
if grep -q "_get_result_mean()" "$ENGINE_FILE" && grep -q "meanNpv:" "$ENGINE_FILE"; then
    echo "PASS: Results returned as JavaScript object with proper properties"
    exit 0
fi

# Alternative: check for result extraction pattern
if grep -q "statistics:" "$ENGINE_FILE"; then
    echo "PASS: Results returned as JavaScript object"
    exit 0
fi

echo "FAIL: Could not verify results are returned as JS objects"
exit 1
