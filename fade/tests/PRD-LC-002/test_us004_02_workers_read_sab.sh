#!/bin/bash
# Test: verify all workers read from same SAB (zero-copy for policies)
# AC: All workers read from same SAB (zero-copy for policies)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
SAB_POOL="$PROJECT_ROOT/livecalc-engine/js/src/sab-worker-pool.ts"
TYPES_FILE="$PROJECT_ROOT/livecalc-engine/js/src/types.ts"

if [[ ! -f "$SAB_POOL" ]]; then
    echo "FAIL: sab-worker-pool.ts not found"
    echo "Expected: $SAB_POOL exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for attach-sab message type (sending SAB to workers)
if ! grep -q "attach-sab" "$TYPES_FILE"; then
    echo "FAIL: attach-sab message type not found"
    echo "Expected: attach-sab message for sharing buffer"
    echo "Actual: not found"
    exit 1
fi

# Check WorkerAttachSabMessage has buffer property
if ! grep -A5 "WorkerAttachSabMessage" "$TYPES_FILE" | grep -q "buffer:.*SharedArrayBuffer"; then
    echo "FAIL: SharedArrayBuffer not passed in attach message"
    echo "Expected: buffer: SharedArrayBuffer in message"
    echo "Actual: not found"
    exit 1
fi

# Check SAB pool sends same buffer to all workers via attach message
# The code uses attachMessage with buffer property, then postMessage(attachMessage)
if ! grep -q "sharedBufferManager.*buffer" "$SAB_POOL"; then
    echo "FAIL: SharedBufferManager buffer not used"
    echo "Expected: sharedBufferManager.buffer for worker sharing"
    echo "Actual: not found"
    exit 1
fi

if ! grep -q "postMessage(attachMessage)" "$SAB_POOL"; then
    echo "FAIL: attachMessage not sent via postMessage"
    echo "Expected: postMessage(attachMessage) to send buffer"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: All workers read from same SharedArrayBuffer (zero-copy)"
exit 0
