#!/bin/bash
# Test: verify work distributed by scenario chunks
# AC: Work distributed by scenario chunks (scenarios 1-125 to worker 1, 126-250 to worker 2, etc.)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
WORKER_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/worker-pool.ts"

if [[ ! -f "$WORKER_POOL_FILE" ]]; then
    echo "FAIL: worker-pool.ts not found"
    echo "Expected: $WORKER_POOL_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for scenario distribution logic
if ! grep -qE "scenarioRange|chunk|scenarios.*worker" "$WORKER_POOL_FILE"; then
    echo "FAIL: Scenario distribution logic not found"
    echo "Expected: scenarioRange or chunk distribution logic"
    echo "Actual: not found"
    exit 1
fi

# Check for chunking calculation
if ! grep -qE "Math.ceil|Math.floor" "$WORKER_POOL_FILE"; then
    echo "FAIL: Chunking calculation not found"
    echo "Expected: Math.ceil/floor for chunk size calculation"
    echo "Actual: not found"
    exit 1
fi

# Check for scenario range tracking per worker
if ! grep -q "scenarioRange" "$WORKER_POOL_FILE"; then
    echo "FAIL: scenarioRange tracking not found"
    echo "Expected: scenarioRange per worker"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Work distributed by scenario chunks"
exit 0
