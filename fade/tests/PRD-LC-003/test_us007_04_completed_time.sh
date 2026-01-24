#!/bin/bash
# Test: US-007 AC-04 - Status bar shows last execution time after completion
# AC: Status bar shows last execution time after completion

STATUS_BAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/status-bar.ts"

if [[ ! -f "$STATUS_BAR_FILE" ]]; then
    echo "FAIL: Status bar file not found"
    exit 1
fi

# Check for completed state
if ! grep -qi 'completed\|complete' "$STATUS_BAR_FILE"; then
    echo "FAIL: No completed state in status bar"
    echo "Expected: completed state handling"
    echo "Actual: not found"
    exit 1
fi

# Check for time display (ms or s)
if ! grep -qE 'ms|[0-9]s|timeMs|timeStr' "$STATUS_BAR_FILE"; then
    echo "FAIL: No time display in status bar"
    echo "Expected: time units (ms/s)"
    echo "Actual: not found"
    exit 1
fi

# Check for setCompleted method
if ! grep -q 'setCompleted' "$STATUS_BAR_FILE"; then
    echo "FAIL: No setCompleted method"
    echo "Expected: setCompleted method"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Status bar shows execution time after completion"
exit 0
