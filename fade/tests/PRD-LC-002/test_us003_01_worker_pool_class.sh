#!/bin/bash
# Test: verify WorkerPool class manages N workers
# AC: WorkerPool class manages N workers (default: navigator.hardwareConcurrency or 4)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
WORKER_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/worker-pool.ts"

if [[ ! -f "$WORKER_POOL_FILE" ]]; then
    echo "FAIL: worker-pool.ts not found"
    echo "Expected: $WORKER_POOL_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for WorkerPool class
if ! grep -q "export class WorkerPool" "$WORKER_POOL_FILE"; then
    echo "FAIL: WorkerPool class not exported"
    echo "Expected: export class WorkerPool"
    echo "Actual: not found"
    exit 1
fi

# Check for numWorkers configuration
if ! grep -q "numWorkers" "$WORKER_POOL_FILE"; then
    echo "FAIL: numWorkers configuration not found"
    echo "Expected: numWorkers parameter in WorkerPool"
    echo "Actual: not found"
    exit 1
fi

# Check for workers array/tracking
if ! grep -q "private workers:" "$WORKER_POOL_FILE"; then
    echo "FAIL: workers array not found"
    echo "Expected: private workers array for worker management"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: WorkerPool class manages N workers with configurable numWorkers"
exit 0
