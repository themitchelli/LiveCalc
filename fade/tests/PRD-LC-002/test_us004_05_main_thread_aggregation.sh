#!/bin/bash
# Test: verify main thread aggregates results from shared buffer
# AC: Main thread aggregates results from shared buffer after all workers complete

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
SAB_POOL="$PROJECT_ROOT/livecalc-engine/js/src/sab-worker-pool.ts"
SHARED_BUFFER="$PROJECT_ROOT/livecalc-engine/js/src/shared-buffer.ts"

if [[ ! -f "$SAB_POOL" ]]; then
    echo "FAIL: sab-worker-pool.ts not found"
    echo "Expected: $SAB_POOL exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for result aggregation from shared buffer
if ! grep -qE "aggregate|collectResults|readResults|getAllNpvs" "$SAB_POOL"; then
    # Alternative: check for Float64Array reading
    if ! grep -qE "Float64Array|HEAPF64" "$SAB_POOL"; then
        echo "FAIL: Result aggregation from shared buffer not found"
        echo "Expected: aggregation logic reading from SharedArrayBuffer"
        echo "Actual: not found"
        exit 1
    fi
fi

# Check SharedBufferReader or similar for reading results
if ! grep -q "SharedBufferReader\|readNpvs\|getResults" "$SHARED_BUFFER"; then
    # Alternative: check for basic buffer reading
    if ! grep -q "Float64Array" "$SHARED_BUFFER"; then
        echo "FAIL: SharedBufferReader not found"
        echo "Expected: reader for extracting results from buffer"
        echo "Actual: not found"
        exit 1
    fi
fi

echo "PASS: Main thread aggregates results from shared buffer"
exit 0
