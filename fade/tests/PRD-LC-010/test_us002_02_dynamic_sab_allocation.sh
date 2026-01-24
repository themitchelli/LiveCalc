#!/bin/bash
# Test: verify dynamic allocation of a single large SharedArrayBuffer
# AC: Dynamic allocation of a single large SharedArrayBuffer

MEMORY_MANAGER_FILE="livecalc-engine/js/src/orchestrator/memory-manager.ts"

# Assert - Check for SharedArrayBuffer allocation
if ! grep -q 'SharedArrayBuffer' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not reference SharedArrayBuffer"
    echo "Expected: SharedArrayBuffer allocation in memory manager"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for allocate method
if ! grep -q 'allocate' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not have allocate method"
    echo "Expected: allocate method for SAB creation"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for dynamic buffer creation
if ! grep -q 'new SharedArrayBuffer' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not create new SharedArrayBuffer"
    echo "Expected: 'new SharedArrayBuffer' for dynamic allocation"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for single buffer approach (getBuffer returns the one buffer)
if ! grep -q 'getBuffer' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not have getBuffer method"
    echo "Expected: getBuffer method to retrieve allocated SAB"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Dynamic allocation of a single large SharedArrayBuffer"
exit 0
