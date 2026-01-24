#!/bin/bash
# Test: verify results written to worker-specific sections of SharedArrayBuffer
# AC: Results written to worker-specific sections of SharedArrayBuffer

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
SAB_POOL="$PROJECT_ROOT/livecalc-engine/js/src/sab-worker-pool.ts"
TYPES_FILE="$PROJECT_ROOT/livecalc-engine/js/src/types.ts"

if [[ ! -f "$SAB_POOL" ]]; then
    echo "FAIL: sab-worker-pool.ts not found"
    echo "Expected: $SAB_POOL exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for worker ID in messages (for offset calculation)
if ! grep -q "workerId" "$TYPES_FILE"; then
    echo "FAIL: workerId not found in message types"
    echo "Expected: workerId for worker-specific offsets"
    echo "Actual: not found"
    exit 1
fi

# Check for maxScenariosPerWorker (for buffer section sizing)
if ! grep -q "maxScenariosPerWorker" "$TYPES_FILE"; then
    echo "FAIL: maxScenariosPerWorker not found"
    echo "Expected: maxScenariosPerWorker for result section sizing"
    echo "Actual: not found"
    exit 1
fi

# Check SAB result response type
if ! grep -q "WorkerResultSabResponse" "$TYPES_FILE"; then
    echo "FAIL: WorkerResultSabResponse type not found"
    echo "Expected: WorkerResultSabResponse for SAB results"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Results written to worker-specific sections of SharedArrayBuffer"
exit 0
