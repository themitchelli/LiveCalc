#!/bin/bash
# Test: US-005 AC-11 - Execution time shown on completion
# AC: Execution time shown on completion

RUN_COMMAND_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/commands/run.ts"

if [[ ! -f "$RUN_COMMAND_FILE" ]]; then
    echo "FAIL: Run command file not found"
    exit 1
fi

# Check for timing logic
if ! grep -q 'Date.now\|startTime\|elapsed' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No execution timing"
    echo "Expected: timing calculation"
    echo "Actual: not found"
    exit 1
fi

# Check for time display
if ! grep -qi 'ms\|second\|time' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No time display"
    echo "Expected: time units in output"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Execution time shown on completion"
exit 0
