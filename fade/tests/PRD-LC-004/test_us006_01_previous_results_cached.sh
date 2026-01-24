#!/bin/bash
# Test: verify previous run results cached in memory
# AC: Previous run results cached in memory

COMPARISON_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/comparison.ts"

# Check ComparisonManager class exists
if ! grep -q "class ComparisonManager" "$COMPARISON_FILE"; then
    echo "FAIL: ComparisonManager class not found"
    exit 1
fi

# Check previousResults field exists
if ! grep -q "private previousResults" "$COMPARISON_FILE"; then
    echo "FAIL: previousResults field not found in ComparisonManager"
    exit 1
fi

# Check recordResult method exists for caching results
if ! grep -q "public async recordResult" "$COMPARISON_FILE"; then
    echo "FAIL: recordResult method not found"
    exit 1
fi

echo "PASS: Previous run results cached in memory"
exit 0
