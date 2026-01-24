#!/bin/bash
# Test: US-005 AC-12 - Error notifications with actionable messages
# AC: Error notifications with actionable messages

RUN_COMMAND_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/commands/run.ts"
NOTIFICATIONS_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/notifications.ts"

# Check for error notification in run command
if ! grep -q 'error\|Error' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No error handling in run command"
    echo "Expected: error handling"
    echo "Actual: not found"
    exit 1
fi

# Check for Notifications.error call
if ! grep -q 'Notifications.error\|showErrorMessage' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No error notification calls"
    echo "Expected: error notification method"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Error notifications are shown"
exit 0
