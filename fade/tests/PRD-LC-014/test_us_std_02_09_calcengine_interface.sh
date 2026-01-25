#!/bin/bash
# Test: verify coding.md documents CalcEngine interface requirement
# AC: CalcEngine interface requirement: 'All calculation engines must implement CalcEngine interface (initialize, runChunk, dispose)'

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    exit 1
fi

# Check for CalcEngine mention
if ! grep -qi "CalcEngine" "$CODING_FILE"; then
    echo "FAIL: CalcEngine interface not documented"
    echo "Expected: CalcEngine interface requirement"
    echo "Actual: CalcEngine not found"
    exit 1
fi

# Check for interface methods
if ! grep -qi "initialize\|runChunk\|dispose" "$CODING_FILE"; then
    echo "FAIL: CalcEngine interface methods not documented"
    echo "Expected: initialize, runChunk, dispose methods"
    echo "Actual: Methods not found"
    exit 1
fi

echo "PASS: CalcEngine interface requirement documented (initialize, runChunk, dispose)"
exit 0
