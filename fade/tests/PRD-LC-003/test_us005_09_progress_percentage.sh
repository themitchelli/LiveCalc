#!/bin/bash
# Test: US-005 AC-09 - Progress shows percentage complete
# AC: Progress shows percentage complete

RUN_COMMAND_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/commands/run.ts"

if [[ ! -f "$RUN_COMMAND_FILE" ]]; then
    echo "FAIL: Run command file not found"
    exit 1
fi

# Check for progress.report with percentage
if ! grep -q 'progress.report\|progressCallback' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No progress reporting"
    echo "Expected: progress.report calls"
    echo "Actual: not found"
    exit 1
fi

# Check for percentage in message
if ! grep -q '%' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No percentage in progress messages"
    echo "Expected: percentage symbol in messages"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Progress shows percentage complete"
exit 0
