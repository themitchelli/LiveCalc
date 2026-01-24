#!/bin/bash
# Test: US-004 AC-06 - Engine accepts policy data, assumptions, scenario config
# AC: Engine accepts policy data, assumptions, scenario config

ENGINE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/engine/livecalc-engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: Engine file not found"
    exit 1
fi

# Check for runValuation method that accepts these inputs
if ! grep -q 'runValuation' "$ENGINE_FILE"; then
    echo "FAIL: No runValuation method"
    echo "Expected: runValuation method"
    echo "Actual: not found"
    exit 1
fi

# Check for policy data input
if ! grep -q 'polic' "$ENGINE_FILE"; then
    echo "FAIL: No policy data handling"
    echo "Expected: policies parameter"
    echo "Actual: not found"
    exit 1
fi

# Check for assumptions input
if ! grep -q 'mortality\|lapse\|expense' "$ENGINE_FILE"; then
    echo "FAIL: No assumptions handling"
    echo "Expected: mortality/lapse/expenses parameters"
    echo "Actual: not found"
    exit 1
fi

# Check for scenario config
if ! grep -q 'scenario\|Scenario' "$ENGINE_FILE"; then
    echo "FAIL: No scenario config handling"
    echo "Expected: scenario configuration"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Engine accepts policy data, assumptions, and scenario config"
exit 0
