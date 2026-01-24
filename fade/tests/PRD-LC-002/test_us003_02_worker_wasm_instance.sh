#!/bin/bash
# Test: verify each worker loads its own WASM instance
# AC: Each worker loads its own WASM instance

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
WORKER_FILE="$PROJECT_ROOT/livecalc-engine/js/src/worker.ts"
WORKER_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/worker-pool.ts"

if [[ ! -f "$WORKER_FILE" ]]; then
    echo "FAIL: worker.ts not found"
    echo "Expected: $WORKER_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check worker has init message handling
if ! grep -q "type.*init" "$WORKER_FILE"; then
    echo "FAIL: Worker does not handle init message"
    echo "Expected: init message handling in worker"
    echo "Actual: not found"
    exit 1
fi

# Check worker loads WASM module
if ! grep -qE "createLiveCalcModule|import.*livecalc" "$WORKER_FILE"; then
    echo "FAIL: Worker does not load WASM module"
    echo "Expected: WASM module loading in worker"
    echo "Actual: not found"
    exit 1
fi

# Check pool sends init message with wasmPath
if ! grep -q "wasmPath" "$WORKER_POOL_FILE"; then
    echo "FAIL: WorkerPool does not send wasmPath to workers"
    echo "Expected: wasmPath in worker initialization"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Each worker loads its own WASM instance"
exit 0
