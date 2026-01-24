#!/bin/bash
# Test: US-007 AC-06 - Click on status bar item opens LiveCalc output channel
# AC: Click on status bar item opens LiveCalc output channel

STATUS_BAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/status-bar.ts"

if [[ ! -f "$STATUS_BAR_FILE" ]]; then
    echo "FAIL: Status bar file not found"
    exit 1
fi

# Check for command assignment
if ! grep -q 'command\s*=' "$STATUS_BAR_FILE"; then
    echo "FAIL: No command on status bar item"
    echo "Expected: command assignment"
    echo "Actual: not found"
    exit 1
fi

# Check for output/showOutput command
if ! grep -q 'showOutput\|Output' "$STATUS_BAR_FILE"; then
    echo "FAIL: Status bar command doesn't open output"
    echo "Expected: showOutput command"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Status bar click opens output channel"
exit 0
