#!/bin/bash
# Test: US-007 AC-03 - Status bar shows 'Running...' with spinner during execution
# AC: Status bar shows 'Running...' with spinner during execution

STATUS_BAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/status-bar.ts"

if [[ ! -f "$STATUS_BAR_FILE" ]]; then
    echo "FAIL: Status bar file not found"
    exit 1
fi

# Check for running state
if ! grep -qi 'running' "$STATUS_BAR_FILE"; then
    echo "FAIL: No 'Running' state in status bar"
    echo "Expected: Running state handling"
    echo "Actual: not found"
    exit 1
fi

# Check for spinner (sync~spin is VS Code's animated spinner)
if ! grep -q 'sync~spin\|spinner' "$STATUS_BAR_FILE"; then
    echo "FAIL: No spinner animation"
    echo "Expected: sync~spin icon for spinner"
    echo "Actual: not found"
    exit 1
fi

# Check for setRunning method
if ! grep -q 'setRunning' "$STATUS_BAR_FILE"; then
    echo "FAIL: No setRunning method"
    echo "Expected: setRunning method"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Status bar has 'Running' state with spinner"
exit 0
