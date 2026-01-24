#!/bin/bash
# Test: US-007 AC-02 - Status bar shows 'Ready' when engine initialized
# AC: Status bar shows 'Ready' when engine initialized

STATUS_BAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/status-bar.ts"

if [[ ! -f "$STATUS_BAR_FILE" ]]; then
    echo "FAIL: Status bar file not found"
    exit 1
fi

# Check for ready state
if ! grep -qi 'ready' "$STATUS_BAR_FILE"; then
    echo "FAIL: No 'Ready' state in status bar"
    echo "Expected: Ready state handling"
    echo "Actual: not found"
    exit 1
fi

# Check for setReady method
if ! grep -q 'setReady' "$STATUS_BAR_FILE"; then
    echo "FAIL: No setReady method"
    echo "Expected: setReady method"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Status bar has 'Ready' state"
exit 0
