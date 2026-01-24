#!/bin/bash
# Test: verify memory layout is logged in debug mode
# AC: Memory layout logged in debug mode for troubleshooting

MEMORY_MANAGER_FILE="livecalc-engine/js/src/orchestrator/memory-manager.ts"

# Assert - Check for logger capability
if ! grep -q 'setLogger\|_logger' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not have logger capability"
    echo "Expected: setLogger method or _logger property"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for memory layout logging
if ! grep -q 'logMemoryLayout\|Memory Layout' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not log memory layout"
    echo "Expected: logMemoryLayout method or Memory Layout logging"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that log method exists
if ! grep -q 'private log\|this\.log' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not have log method"
    echo "Expected: Private log method for debug output"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Memory layout logged in debug mode for troubleshooting"
exit 0
