#!/bin/bash
# Test: US-004 AC-05 - Worker pool created based on available CPU cores
# AC: Worker pool created based on available CPU cores

ENGINE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/engine/livecalc-engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: Engine file not found"
    exit 1
fi

# Check for CPU core detection
if ! grep -q 'cpus\|cpu\|hardwareConcurrency' "$ENGINE_FILE"; then
    echo "FAIL: No CPU core detection"
    echo "Expected: os.cpus() or similar"
    echo "Actual: not found"
    exit 1
fi

# Check for worker count calculation
if ! grep -q 'getWorkerCount\|maxWorkers\|workerCount' "$ENGINE_FILE"; then
    echo "FAIL: No worker count management"
    echo "Expected: worker count based on CPUs"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Engine has CPU-based worker pool configuration"
exit 0
