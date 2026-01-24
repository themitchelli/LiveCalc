#!/bin/bash
# Test: verify policy file path and count displayed
# AC: Policy file path and count displayed

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"

# Check HTML has policy fields
if ! grep -q "meta-policies" "$PANEL_FILE"; then
    echo "FAIL: meta-policies element not found in panel HTML"
    exit 1
fi

if ! grep -q "meta-policy-count" "$PANEL_FILE"; then
    echo "FAIL: meta-policy-count element not found in panel HTML"
    exit 1
fi

if ! grep -q "Policy File" "$PANEL_FILE"; then
    echo "FAIL: 'Policy File' label not found in panel HTML"
    exit 1
fi

# Check RunMetadata has required fields
if ! grep -q "policyFile" "$STATE_FILE"; then
    echo "FAIL: policyFile field not found in RunMetadata"
    exit 1
fi

if ! grep -q "policyCount: number" "$STATE_FILE"; then
    echo "FAIL: policyCount field not found in RunMetadata"
    exit 1
fi

echo "PASS: Policy file path and count displayed"
exit 0
