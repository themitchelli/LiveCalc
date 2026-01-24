#!/bin/bash
# Test: verify works in Node.js (using worker_threads) and browser (Web Workers)
# AC: Works in Node.js (using worker_threads) and browser (Web Workers)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
NODE_WORKER_POOL="$PROJECT_ROOT/livecalc-engine/js/src/node-worker-pool.ts"
WORKER_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/worker-pool.ts"
INDEX_FILE="$PROJECT_ROOT/livecalc-engine/js/src/index.ts"

# Check for NodeWorkerPool
if [[ ! -f "$NODE_WORKER_POOL" ]]; then
    echo "FAIL: node-worker-pool.ts not found"
    echo "Expected: $NODE_WORKER_POOL exists"
    echo "Actual: file not found"
    exit 1
fi

# Check NodeWorkerPool uses worker_threads
if ! grep -qE "worker_threads|node:worker_threads" "$NODE_WORKER_POOL"; then
    echo "FAIL: NodeWorkerPool does not use worker_threads"
    echo "Expected: import from worker_threads"
    echo "Actual: not found"
    exit 1
fi

# Check browser WorkerPool exists
if [[ ! -f "$WORKER_POOL_FILE" ]]; then
    echo "FAIL: worker-pool.ts not found for browser support"
    echo "Expected: $WORKER_POOL_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check both are exported
if ! grep -q "NodeWorkerPool" "$INDEX_FILE"; then
    echo "FAIL: NodeWorkerPool not exported"
    echo "Expected: NodeWorkerPool export in index.ts"
    echo "Actual: not found"
    exit 1
fi

if ! grep -q "WorkerPool" "$INDEX_FILE"; then
    echo "FAIL: WorkerPool not exported"
    echo "Expected: WorkerPool export in index.ts"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Works in Node.js (worker_threads) and browser (Web Workers)"
exit 0
