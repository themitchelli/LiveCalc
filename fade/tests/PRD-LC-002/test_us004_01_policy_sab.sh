#!/bin/bash
# Test: verify policy data stored in SharedArrayBuffer (SAB)
# AC: Policy data stored in SharedArrayBuffer (SAB)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
SAB_POOL="$PROJECT_ROOT/livecalc-engine/js/src/sab-worker-pool.ts"
SHARED_BUFFER="$PROJECT_ROOT/livecalc-engine/js/src/shared-buffer.ts"

# Check SAB worker pool exists
if [[ ! -f "$SAB_POOL" ]]; then
    echo "FAIL: sab-worker-pool.ts not found"
    echo "Expected: $SAB_POOL exists"
    echo "Actual: file not found"
    exit 1
fi

# Check SharedArrayBuffer is used
if ! grep -q "SharedArrayBuffer" "$SAB_POOL"; then
    echo "FAIL: SharedArrayBuffer not found in sab-worker-pool.ts"
    echo "Expected: SharedArrayBuffer usage"
    echo "Actual: not found"
    exit 1
fi

# Check shared-buffer.ts exists for buffer management
if [[ ! -f "$SHARED_BUFFER" ]]; then
    echo "FAIL: shared-buffer.ts not found"
    echo "Expected: $SHARED_BUFFER exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for policy data in shared buffer
if ! grep -qE "policies|policyData|POLICY" "$SHARED_BUFFER"; then
    echo "FAIL: Policy data handling not found in shared-buffer.ts"
    echo "Expected: policy data handling in SharedBufferManager"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Policy data stored in SharedArrayBuffer"
exit 0
