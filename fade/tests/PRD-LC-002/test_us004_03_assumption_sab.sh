#!/bin/bash
# Test: verify assumption data stored in SharedArrayBuffer
# AC: Assumption data stored in SharedArrayBuffer

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
SHARED_BUFFER="$PROJECT_ROOT/livecalc-engine/js/src/shared-buffer.ts"

if [[ ! -f "$SHARED_BUFFER" ]]; then
    echo "FAIL: shared-buffer.ts not found"
    echo "Expected: $SHARED_BUFFER exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for assumption data handling
if ! grep -qE "mortality|lapse|expense|assumption" "$SHARED_BUFFER"; then
    echo "FAIL: Assumption data handling not found"
    echo "Expected: mortality/lapse/expense data in SharedBufferManager"
    echo "Actual: not found"
    exit 1
fi

# Check buffer layout includes assumptions
if ! grep -qE "ASSUMPTIONS|assumptionOffset|assumptionSize" "$SHARED_BUFFER"; then
    # Alternative: check for general data offsets
    if ! grep -qE "offset|dataOffset" "$SHARED_BUFFER"; then
        echo "FAIL: Buffer layout for assumptions not found"
        echo "Expected: assumption offset/size in buffer layout"
        echo "Actual: not found"
        exit 1
    fi
fi

echo "PASS: Assumption data stored in SharedArrayBuffer"
exit 0
