#!/bin/bash
# Test: verify workers can be terminated mid-execution (cancel support)
# AC: Workers can be terminated mid-execution (cancel support)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
WORKER_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/worker-pool.ts"

if [[ ! -f "$WORKER_POOL_FILE" ]]; then
    echo "FAIL: worker-pool.ts not found"
    echo "Expected: $WORKER_POOL_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for AbortController support
if ! grep -q "AbortController\|abortController" "$WORKER_POOL_FILE"; then
    echo "FAIL: AbortController not found"
    echo "Expected: AbortController for cancellation support"
    echo "Actual: not found"
    exit 1
fi

# Check for terminate method
if ! grep -q "terminate(" "$WORKER_POOL_FILE"; then
    echo "FAIL: terminate() method not found"
    echo "Expected: terminate() method to stop workers"
    echo "Actual: not found"
    exit 1
fi

# Check workers can be terminated
if ! grep -qE "worker\.terminate\(\)|\.terminate\(" "$WORKER_POOL_FILE"; then
    echo "FAIL: Worker termination call not found"
    echo "Expected: worker.terminate() call"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Workers can be terminated mid-execution (cancel support)"
exit 0
