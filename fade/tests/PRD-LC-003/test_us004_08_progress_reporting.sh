#!/bin/bash
# Test: US-004 AC-08 - Engine reports progress during execution (0-100%)
# AC: Engine reports progress during execution (0-100%)

ENGINE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/engine/livecalc-engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: Engine file not found"
    exit 1
fi

# Check for progress callback
if ! grep -q 'progressCallback\|ProgressCallback' "$ENGINE_FILE"; then
    echo "FAIL: No progress callback support"
    echo "Expected: progressCallback parameter"
    echo "Actual: not found"
    exit 1
fi

# Check for progress percentage calls
if ! grep -qE 'progressCallback\?\.\([0-9]|progress.*[0-9]' "$ENGINE_FILE"; then
    echo "FAIL: No progress percentage reporting"
    echo "Expected: progress calls with percentages"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Engine supports progress reporting"
exit 0
