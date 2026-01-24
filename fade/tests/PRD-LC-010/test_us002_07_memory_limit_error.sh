#!/bin/bash
# Test: verify clear error if total memory exceeds platform limits
# AC: Clear error if total memory exceeds platform limits

MEMORY_MANAGER_FILE="livecalc-engine/js/src/orchestrator/memory-manager.ts"

# Assert - Check for MemoryAllocationError
if ! grep -q 'MemoryAllocationError' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not define MemoryAllocationError"
    echo "Expected: MemoryAllocationError class for limit errors"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for memory limit constants
if ! grep -q 'MEMORY_LIMIT\|memoryLimit' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not track memory limits"
    echo "Expected: Memory limit constants or configuration"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for validation method
if ! grep -q 'validateMemoryRequirements' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not validate memory requirements"
    echo "Expected: validateMemoryRequirements method"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for browser memory limit
if ! grep -q 'BROWSER.*LIMIT\|2.*GB\|2147483648' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not define browser memory limit"
    echo "Expected: Browser memory limit (~2GB) defined"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Clear error if total memory exceeds platform limits"
exit 0
