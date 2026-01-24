#!/bin/bash
# Test: US-005 AC-10 - Cancel button in progress notification
# AC: Cancel button in progress notification

RUN_COMMAND_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/commands/run.ts"

if [[ ! -f "$RUN_COMMAND_FILE" ]]; then
    echo "FAIL: Run command file not found"
    exit 1
fi

# Check for cancellable: true
if ! grep -q 'cancellable:\s*true' "$RUN_COMMAND_FILE"; then
    echo "FAIL: Progress notification not cancellable"
    echo "Expected: cancellable: true"
    echo "Actual: not found"
    exit 1
fi

# Check for token parameter handling
if ! grep -q 'token' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No cancellation token handling"
    echo "Expected: token parameter usage"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Cancel button available in progress notification"
exit 0
