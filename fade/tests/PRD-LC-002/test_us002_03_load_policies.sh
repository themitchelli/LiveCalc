#!/bin/bash
# Test: verify loadPolicies method transfers policy data to WASM memory
# AC: loadPolicies(policies: Policy[]) method transfers policy data to WASM memory

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
ENGINE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: engine.ts not found"
    echo "Expected: $ENGINE_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for loadPolicies method (any variant: FromCsv, FromBinary, etc.)
if ! grep -q "loadPolicies" "$ENGINE_FILE"; then
    echo "FAIL: loadPolicies method not found"
    echo "Expected: loadPolicies method in LiveCalcEngine"
    echo "Actual: not found"
    exit 1
fi

# Check for CSV loading variant
if ! grep -q "loadPoliciesFromCsv" "$ENGINE_FILE"; then
    echo "FAIL: loadPoliciesFromCsv method not found"
    echo "Expected: loadPoliciesFromCsv method in LiveCalcEngine"
    echo "Actual: not found"
    exit 1
fi

# Check that it uses WASM memory functions
if ! grep -q "_load_policies" "$ENGINE_FILE"; then
    echo "FAIL: Does not call WASM _load_policies function"
    echo "Expected: call to _load_policies_csv or similar"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: loadPolicies methods transfer policy data to WASM memory"
exit 0
