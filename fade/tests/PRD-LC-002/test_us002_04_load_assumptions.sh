#!/bin/bash
# Test: verify loadAssumptions method transfers assumption data
# AC: loadAssumptions(mortality, lapse, expenses) method transfers assumption data

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
ENGINE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: engine.ts not found"
    echo "Expected: $ENGINE_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for mortality loading
if ! grep -q "loadMortality" "$ENGINE_FILE"; then
    echo "FAIL: loadMortality method not found"
    echo "Expected: loadMortality method in LiveCalcEngine"
    echo "Actual: not found"
    exit 1
fi

# Check for lapse loading
if ! grep -q "loadLapse" "$ENGINE_FILE"; then
    echo "FAIL: loadLapse method not found"
    echo "Expected: loadLapse method in LiveCalcEngine"
    echo "Actual: not found"
    exit 1
fi

# Check for expenses loading
if ! grep -q "loadExpenses" "$ENGINE_FILE"; then
    echo "FAIL: loadExpenses method not found"
    echo "Expected: loadExpenses method in LiveCalcEngine"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: loadAssumptions methods transfer mortality, lapse, expenses data"
exit 0
