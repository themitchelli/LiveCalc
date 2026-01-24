#!/bin/bash
# Test: verify WASM binary size < 5MB (ideally < 2MB)
# AC: WASM binary size < 5MB (ideally < 2MB)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
WASM_FILE="$PROJECT_ROOT/livecalc-engine/build-wasm/livecalc.wasm"

if [[ ! -f "$WASM_FILE" ]]; then
    echo "FAIL: livecalc.wasm not found"
    echo "Expected: $WASM_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Get file size in bytes
SIZE_BYTES=$(stat -f%z "$WASM_FILE" 2>/dev/null || stat -c%s "$WASM_FILE" 2>/dev/null)

if [[ -z "$SIZE_BYTES" ]]; then
    echo "FAIL: Could not determine file size"
    exit 1
fi

# 5MB = 5242880 bytes
MAX_SIZE=5242880
# 2MB = 2097152 bytes
IDEAL_SIZE=2097152

SIZE_KB=$((SIZE_BYTES / 1024))
SIZE_MB=$((SIZE_BYTES / 1024 / 1024))

if [[ $SIZE_BYTES -gt $MAX_SIZE ]]; then
    echo "FAIL: WASM binary exceeds 5MB limit"
    echo "Expected: < 5MB (5242880 bytes)"
    echo "Actual: ${SIZE_KB}KB (${SIZE_BYTES} bytes)"
    exit 1
fi

if [[ $SIZE_BYTES -lt $IDEAL_SIZE ]]; then
    echo "PASS: WASM binary size ${SIZE_KB}KB is under ideal 2MB limit"
else
    echo "PASS: WASM binary size ${SIZE_KB}KB is under 5MB limit (ideally < 2MB)"
fi
exit 0
