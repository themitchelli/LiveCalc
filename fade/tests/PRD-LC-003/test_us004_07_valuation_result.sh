#!/bin/bash
# Test: US-004 AC-07 - Engine returns ValuationResult object
# AC: Engine returns ValuationResult object

ENGINE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/engine/livecalc-engine.ts"
TYPES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/types/index.ts"

# Check for ValuationResult type definition
if ! grep -q 'ValuationResult' "$ENGINE_FILE"; then
    echo "FAIL: No ValuationResult in engine file"
    echo "Expected: ValuationResult type usage"
    echo "Actual: not found"
    exit 1
fi

# Check that runValuation returns a result
if ! grep -q 'return.*result\|return result\|: Promise<ValuationResult>' "$ENGINE_FILE"; then
    echo "FAIL: runValuation doesn't return ValuationResult"
    echo "Expected: return statement with result"
    echo "Actual: pattern not found"
    exit 1
fi

echo "PASS: Engine returns ValuationResult object"
exit 0
