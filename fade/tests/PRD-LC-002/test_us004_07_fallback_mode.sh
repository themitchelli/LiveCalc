#!/bin/bash
# Test: verify fallback mode for environments without SAB
# AC: Fallback mode for environments without SAB (copy data via postMessage)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
FALLBACK_FILE="$PROJECT_ROOT/livecalc-engine/js/src/fallback.ts"
INDEX_FILE="$PROJECT_ROOT/livecalc-engine/js/src/index.ts"
SHARED_BUFFER="$PROJECT_ROOT/livecalc-engine/js/src/shared-buffer.ts"

# Check fallback.ts exists
if [[ ! -f "$FALLBACK_FILE" ]]; then
    echo "FAIL: fallback.ts not found"
    echo "Expected: $FALLBACK_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for auto-detection function
if ! grep -q "createAutoWorkerPool" "$FALLBACK_FILE"; then
    echo "FAIL: createAutoWorkerPool not found"
    echo "Expected: createAutoWorkerPool for automatic fallback"
    echo "Actual: not found"
    exit 1
fi

# Check for SAB availability detection
if ! grep -q "isSharedArrayBufferAvailable\|SharedArrayBuffer" "$SHARED_BUFFER"; then
    echo "FAIL: SharedArrayBuffer availability check not found"
    echo "Expected: isSharedArrayBufferAvailable function"
    echo "Actual: not found"
    exit 1
fi

# Check fallback is exported
if ! grep -q "createAutoWorkerPool" "$INDEX_FILE"; then
    echo "FAIL: createAutoWorkerPool not exported from index"
    echo "Expected: createAutoWorkerPool export"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Fallback mode for environments without SharedArrayBuffer"
exit 0
