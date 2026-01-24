#!/bin/bash
# Test: US-005 AC-08 - Progress notification shown during execution
# AC: Progress notification shown during execution

RUN_COMMAND_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/commands/run.ts"

if [[ ! -f "$RUN_COMMAND_FILE" ]]; then
    echo "FAIL: Run command file not found"
    exit 1
fi

# Check for withProgress API usage
if ! grep -q 'withProgress' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No progress notification (withProgress)"
    echo "Expected: vscode.window.withProgress() usage"
    echo "Actual: not found"
    exit 1
fi

# Check for ProgressLocation.Notification
if ! grep -q 'ProgressLocation.Notification' "$RUN_COMMAND_FILE"; then
    echo "FAIL: Progress not shown as notification"
    echo "Expected: ProgressLocation.Notification"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Progress notification shown during execution"
exit 0
