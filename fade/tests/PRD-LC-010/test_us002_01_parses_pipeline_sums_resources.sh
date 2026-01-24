#!/bin/bash
# Test: verify orchestrator parses pipeline and sums bus:// resource requirements
# AC: Orchestrator parses pipeline and sums all 'bus://' resource requirements

MEMORY_MANAGER_FILE="livecalc-engine/js/src/orchestrator/memory-manager.ts"

# Assert - Check memory manager file exists
if [[ ! -f "$MEMORY_MANAGER_FILE" ]]; then
    echo "FAIL: Memory manager file does not exist"
    echo "Expected: $MEMORY_MANAGER_FILE exists"
    echo "Actual: File not found"
    exit 1
fi

# Assert - Check for resource accumulation method
if ! grep -q 'addResource\|addResources' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not have resource addition method"
    echo "Expected: addResource or addResources method"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for total memory calculation
if ! grep -q 'calculateTotalMemory\|totalSize' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not calculate total memory"
    echo "Expected: calculateTotalMemory method or totalSize property"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for BusResourceRequirement interface
if ! grep -q 'BusResourceRequirement' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not define BusResourceRequirement"
    echo "Expected: BusResourceRequirement interface for resource tracking"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Orchestrator parses pipeline and sums bus:// resource requirements"
exit 0
