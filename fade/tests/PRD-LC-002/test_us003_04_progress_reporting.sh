#!/bin/bash
# Test: verify workers report progress as percentage complete
# AC: Workers report progress as percentage complete

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
WORKER_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/worker-pool.ts"
TYPES_FILE="$PROJECT_ROOT/livecalc-engine/js/src/types.ts"

if [[ ! -f "$WORKER_POOL_FILE" ]]; then
    echo "FAIL: worker-pool.ts not found"
    echo "Expected: $WORKER_POOL_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for progress callback
if ! grep -q "WorkerProgressCallback\|progressCallback" "$WORKER_POOL_FILE"; then
    echo "FAIL: Progress callback not found"
    echo "Expected: progressCallback parameter or WorkerProgressCallback"
    echo "Actual: not found"
    exit 1
fi

# Check types.ts has progress response
if ! grep -q "WorkerProgressResponse" "$TYPES_FILE"; then
    echo "FAIL: WorkerProgressResponse type not found"
    echo "Expected: WorkerProgressResponse in types.ts"
    echo "Actual: not found"
    exit 1
fi

# Check for percent field in progress
if ! grep -q "percent" "$TYPES_FILE"; then
    echo "FAIL: percent field not found in progress"
    echo "Expected: percent field in WorkerProgressResponse"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Workers report progress as percentage complete"
exit 0
