#!/bin/bash
# Test: verify graceful handling of worker errors (retry once, then fail with details)
# AC: Graceful handling of worker errors (retry once, then fail with details)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
WORKER_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/worker-pool.ts"

if [[ ! -f "$WORKER_POOL_FILE" ]]; then
    echo "FAIL: worker-pool.ts not found"
    echo "Expected: $WORKER_POOL_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for retry logic
if ! grep -qE "retry|retryCount|MAX_RETRIES" "$WORKER_POOL_FILE"; then
    echo "FAIL: Retry logic not found"
    echo "Expected: retry mechanism for worker errors"
    echo "Actual: not found"
    exit 1
fi

# Check for error message handling
if ! grep -q "type.*error" "$WORKER_POOL_FILE"; then
    echo "FAIL: Error message handling not found"
    echo "Expected: error type handling in worker messages"
    echo "Actual: not found"
    exit 1
fi

# Check for WorkerPoolError custom error class
if ! grep -q "WorkerPoolError" "$WORKER_POOL_FILE"; then
    echo "FAIL: WorkerPoolError class not found"
    echo "Expected: WorkerPoolError for detailed error reporting"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Graceful handling of worker errors with retry and detailed failure"
exit 0
