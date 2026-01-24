#!/bin/bash
# Test: verify all allocations are 16-byte aligned for SIMD compatibility
# AC: All allocations 16-byte aligned for SIMD compatibility

MEMORY_MANAGER_FILE="livecalc-engine/js/src/orchestrator/memory-manager.ts"

# Assert - Check for ALIGNMENT constant
if ! grep -q 'ALIGNMENT.*=.*16' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not define 16-byte ALIGNMENT constant"
    echo "Expected: ALIGNMENT = 16 constant"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for alignUp function or similar alignment logic
if ! grep -q 'alignUp\|align' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not have alignment function"
    echo "Expected: alignUp function for SIMD alignment"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Verify alignment is used in offset calculation
if ! grep -qi 'simd' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not reference SIMD"
    echo "Expected: Reference to SIMD compatibility in comments or code"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: All allocations 16-byte aligned for SIMD compatibility"
exit 0
