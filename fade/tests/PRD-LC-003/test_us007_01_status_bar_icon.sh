#!/bin/bash
# Test: US-007 AC-01 - Status bar item shows LiveCalc icon when extension active
# AC: Status bar item shows LiveCalc icon when extension active

STATUS_BAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/status-bar.ts"

if [[ ! -f "$STATUS_BAR_FILE" ]]; then
    echo "FAIL: Status bar file not found"
    echo "Expected: src/ui/status-bar.ts exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for status bar item creation
if ! grep -q 'createStatusBarItem\|StatusBarItem' "$STATUS_BAR_FILE"; then
    echo "FAIL: No status bar item creation"
    echo "Expected: createStatusBarItem or StatusBarItem"
    echo "Actual: not found"
    exit 1
fi

# Check for icon (codicon like $(beaker) or similar)
if ! grep -qE '\$\([a-z]+\)' "$STATUS_BAR_FILE"; then
    echo "FAIL: No icon in status bar"
    echo "Expected: codicon reference like \$(beaker)"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Status bar item has LiveCalc icon"
exit 0
