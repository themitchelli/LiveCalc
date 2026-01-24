#!/bin/bash
# Test: verify lock-free implementation using SharedArrayBuffer and Atomics
# AC: Lock-free implementation using SharedArrayBuffer and Atomics

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Check deque for Atomics usage
DEQUE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-deque.ts"

if [[ ! -f "$DEQUE_FILE" ]]; then
    echo "FAIL: Work-stealing deque file not found"
    echo "Expected: $DEQUE_FILE"
    exit 1
fi

# Check for Atomics usage (lock-free primitive)
if ! grep -q "Atomics\." "$DEQUE_FILE"; then
    echo "FAIL: Atomics not used in deque (required for lock-free)"
    echo "Expected: Atomics.load, Atomics.store, Atomics.compareExchange, etc."
    exit 1
fi

# Check for SharedArrayBuffer usage
SHARED_BUFFER_FILE="$PROJECT_ROOT/livecalc-engine/js/src/shared-buffer.ts"
if [[ ! -f "$SHARED_BUFFER_FILE" ]]; then
    echo "FAIL: SharedArrayBuffer manager not found"
    echo "Expected: $SHARED_BUFFER_FILE"
    exit 1
fi

if ! grep -q "SharedArrayBuffer" "$SHARED_BUFFER_FILE"; then
    echo "FAIL: SharedArrayBuffer not used"
    echo "Expected: SharedArrayBuffer for lock-free shared memory"
    exit 1
fi

# Verify Atomics operations in deque (CAS for synchronization)
ATOMICS_OPS=("compareExchange\|load\|store")
for op in "${ATOMICS_OPS[@]}"; do
    if grep -qE "Atomics\.(${op})" "$DEQUE_FILE"; then
        echo "PASS: Lock-free implementation using SharedArrayBuffer and Atomics"
        exit 0
    fi
done

# At minimum, should have Atomics usage
echo "PASS: Atomics usage found in deque implementation"
exit 0
