#!/bin/bash
# Test: US-007 AC-05 - Status bar shows error indicator if last run failed
# AC: Status bar shows error indicator if last run failed

STATUS_BAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/status-bar.ts"

if [[ ! -f "$STATUS_BAR_FILE" ]]; then
    echo "FAIL: Status bar file not found"
    exit 1
fi

# Check for error state
if ! grep -qi 'error' "$STATUS_BAR_FILE"; then
    echo "FAIL: No error state in status bar"
    echo "Expected: error state handling"
    echo "Actual: not found"
    exit 1
fi

# Check for setError method
if ! grep -q 'setError' "$STATUS_BAR_FILE"; then
    echo "FAIL: No setError method"
    echo "Expected: setError method"
    echo "Actual: not found"
    exit 1
fi

# Check for error icon or background
if ! grep -qE '\$\(error\)|errorBackground' "$STATUS_BAR_FILE"; then
    echo "FAIL: No error indicator styling"
    echo "Expected: error icon or background color"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Status bar shows error indicator"
exit 0
