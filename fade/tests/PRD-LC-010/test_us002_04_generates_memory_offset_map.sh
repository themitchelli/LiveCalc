#!/bin/bash
# Test: verify orchestrator generates MemoryOffsetMap sent to workers
# AC: Generates 'MemoryOffsetMap' (JSON) sent to each worker at init

MEMORY_MANAGER_FILE="livecalc-engine/js/src/orchestrator/memory-manager.ts"

# Assert - Check for MemoryOffsetMap interface
if ! grep -q 'MemoryOffsetMap' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not define MemoryOffsetMap"
    echo "Expected: MemoryOffsetMap interface definition"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for getOffsetMap method
if ! grep -q 'getOffsetMap' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not have getOffsetMap method"
    echo "Expected: getOffsetMap method to retrieve memory layout"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for JSON serialization support
if ! grep -q 'MemoryOffsetMapJSON\|getOffsetMapJSON\|toJSON' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not support JSON serialization"
    echo "Expected: JSON serialization for worker communication"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that offset map contains blocks information
if ! grep -q 'blocks:' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: MemoryOffsetMap does not contain blocks"
    echo "Expected: 'blocks' property in MemoryOffsetMap"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Generates MemoryOffsetMap (JSON) sent to each worker at init"
exit 0
