#!/bin/bash
# Test: verify Node.js wrapper uses worker_threads for parallelism
# AC: Node.js wrapper uses worker_threads for parallelism

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
NODE_WORKER_POOL="$PROJECT_ROOT/livecalc-engine/js/src/node-worker-pool.ts"
NODE_WORKER="$PROJECT_ROOT/livecalc-engine/js/src/node-worker.ts"

# Check NodeWorkerPool exists
if [[ ! -f "$NODE_WORKER_POOL" ]]; then
    echo "FAIL: node-worker-pool.ts not found"
    echo "Expected: $NODE_WORKER_POOL exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for worker_threads import
if ! grep -qE "worker_threads|node:worker_threads" "$NODE_WORKER_POOL"; then
    echo "FAIL: worker_threads not imported in NodeWorkerPool"
    echo "Expected: import from worker_threads"
    echo "Actual: not found"
    exit 1
fi

# Check Node worker file exists
if [[ ! -f "$NODE_WORKER" ]]; then
    echo "FAIL: node-worker.ts not found"
    echo "Expected: $NODE_WORKER exists"
    echo "Actual: file not found"
    exit 1
fi

# Check node-worker uses parentPort
if ! grep -q "parentPort" "$NODE_WORKER"; then
    echo "FAIL: parentPort not used in node-worker"
    echo "Expected: parentPort for worker_threads communication"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Node.js wrapper uses worker_threads for parallelism"
exit 0
