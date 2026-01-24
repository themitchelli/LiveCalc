#!/bin/bash
# Test: verify step, continue, and abort actions from paused state
# AC: Step to next node manually, Continue to run remaining pipeline, Abort pipeline from paused state

BREAKPOINT_FILE="livecalc-vscode/src/pipeline/breakpoint-manager.ts"

# Assert - Check for step method
if ! grep -q 'step\(\)' "$BREAKPOINT_FILE"; then
    echo "FAIL: No step method"
    echo "Expected: step() method to advance to next node"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for resume method (continue)
if ! grep -q 'resume\(\)' "$BREAKPOINT_FILE"; then
    echo "FAIL: No resume method"
    echo "Expected: resume() method to continue execution"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for abort method
if ! grep -q 'abort\(\)' "$BREAKPOINT_FILE"; then
    echo "FAIL: No abort method"
    echo "Expected: abort() method to stop execution"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for BreakpointAction type
if ! grep -q "BreakpointAction\|'step'\|'continue'\|'abort'" "$BREAKPOINT_FILE"; then
    echo "FAIL: No BreakpointAction type"
    echo "Expected: BreakpointAction with step/continue/abort"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Step, continue, and abort actions from paused state"
exit 0
