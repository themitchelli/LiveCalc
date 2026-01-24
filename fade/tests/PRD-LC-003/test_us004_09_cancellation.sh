#!/bin/bash
# Test: US-004 AC-09 - Engine can be cancelled mid-execution
# AC: Engine can be cancelled mid-execution

ENGINE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/engine/livecalc-engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: Engine file not found"
    exit 1
fi

# Check for cancellation token support
if ! grep -q 'CancellationToken\|cancellation' "$ENGINE_FILE"; then
    echo "FAIL: No cancellation token support"
    echo "Expected: CancellationToken parameter"
    echo "Actual: not found"
    exit 1
fi

# Check for cancellation check logic
if ! grep -q 'isCancellationRequested\|aborted\|checkCancellation' "$ENGINE_FILE"; then
    echo "FAIL: No cancellation check logic"
    echo "Expected: cancellation check implementation"
    echo "Actual: not found"
    exit 1
fi

# Check for CANCELLED error code
if ! grep -q 'CANCELLED' "$ENGINE_FILE"; then
    echo "FAIL: No CANCELLED error handling"
    echo "Expected: CANCELLED error code"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Engine supports mid-execution cancellation"
exit 0
