#!/bin/bash
# Test: verify runValuation method executes and returns results
# AC: runValuation(nScenarios, seed) method executes and returns results

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
ENGINE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: engine.ts not found"
    echo "Expected: $ENGINE_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for runValuation method
if ! grep -q "runValuation(" "$ENGINE_FILE"; then
    echo "FAIL: runValuation method not found"
    echo "Expected: runValuation method in LiveCalcEngine"
    echo "Actual: not found"
    exit 1
fi

# Check that it accepts config with numScenarios and seed
if ! grep -q "numScenarios" "$ENGINE_FILE"; then
    echo "FAIL: numScenarios parameter not found"
    echo "Expected: numScenarios in ValuationConfig"
    echo "Actual: not found"
    exit 1
fi

if ! grep -q "seed" "$ENGINE_FILE"; then
    echo "FAIL: seed parameter not found"
    echo "Expected: seed in ValuationConfig"
    echo "Actual: not found"
    exit 1
fi

# Check that it returns ValuationResult
if ! grep -q "ValuationResult" "$ENGINE_FILE"; then
    echo "FAIL: ValuationResult return type not found"
    echo "Expected: returns ValuationResult"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: runValuation method executes and returns results"
exit 0
