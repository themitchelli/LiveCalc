#!/bin/bash
# Test: verify each assumption shows name, source, version if applicable
# AC: For each assumption: name, source (local file or AM reference), version if applicable

STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"

# Check AssumptionInfo has name field
if ! grep -q "name: string" "$STATE_FILE"; then
    echo "FAIL: name field not found in AssumptionInfo"
    exit 1
fi

# Check AssumptionInfo has source field
if ! grep -q "source: string" "$STATE_FILE"; then
    echo "FAIL: source field not found in AssumptionInfo"
    exit 1
fi

# Check AssumptionInfo has version field (optional for AM refs)
if ! grep -q "version" "$STATE_FILE"; then
    echo "FAIL: version field not found in AssumptionInfo"
    exit 1
fi

# Check AssumptionInfo has isLocal field to distinguish sources
if ! grep -q "isLocal: boolean" "$STATE_FILE"; then
    echo "FAIL: isLocal field not found in AssumptionInfo"
    exit 1
fi

echo "PASS: Assumption shows name, source, version"
exit 0
