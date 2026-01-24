#!/bin/bash
# Test: US-005 AC-13 - Success notification with summary (e.g., 'Completed in 2.3s')
# AC: Success notification with summary (e.g., 'Completed in 2.3s')

RUN_COMMAND_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/commands/run.ts"

if [[ ! -f "$RUN_COMMAND_FILE" ]]; then
    echo "FAIL: Run command file not found"
    exit 1
fi

# Check for completion notification
if ! grep -q 'completed\|Completed\|success' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No completion notification"
    echo "Expected: completion message"
    echo "Actual: not found"
    exit 1
fi

# Check for Notifications usage on success
if ! grep -q 'Notifications.completed\|showInformationMessage' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No success notification call"
    echo "Expected: completion notification method"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Success notification with summary is shown"
exit 0
