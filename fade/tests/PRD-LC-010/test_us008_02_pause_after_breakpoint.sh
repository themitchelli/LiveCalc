#!/bin/bash
# Test: verify pipeline pauses after breakpoint node completes
# AC: Pipeline pauses after breakpoint node completes

BREAKPOINT_FILE="livecalc-vscode/src/pipeline/breakpoint-manager.ts"

# Assert - Check for shouldPauseAt method
if ! grep -q 'shouldPauseAt' "$BREAKPOINT_FILE"; then
    echo "FAIL: No shouldPauseAt method"
    echo "Expected: shouldPauseAt to check pause conditions"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for pauseAt method
if ! grep -q 'pauseAt' "$BREAKPOINT_FILE"; then
    echo "FAIL: No pauseAt method"
    echo "Expected: pauseAt to pause execution"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for PausedState interface
if ! grep -q 'PausedState' "$BREAKPOINT_FILE"; then
    echo "FAIL: No PausedState interface"
    echo "Expected: PausedState for tracking pause state"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for isPaused in state
if ! grep -q 'isPaused:' "$BREAKPOINT_FILE"; then
    echo "FAIL: PausedState does not include isPaused"
    echo "Expected: isPaused flag in state"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Pipeline pauses after breakpoint node completes"
exit 0
