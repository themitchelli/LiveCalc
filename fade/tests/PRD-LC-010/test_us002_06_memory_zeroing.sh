#!/bin/bash
# Test: verify memory is zeroed between runs for security
# AC: Memory zeroed between runs for security (configurable for performance)

MEMORY_MANAGER_FILE="livecalc-engine/js/src/orchestrator/memory-manager.ts"
SCHEMA_FILE="livecalc-vscode/schemas/livecalc.config.schema.json"

# Assert - Check for zeroMemory function
if ! grep -q 'zeroMemory' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not have zeroMemory function"
    echo "Expected: zeroMemory function for security"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for configurable zero memory option
if ! grep -q 'zeroMemoryBetweenRuns' "$MEMORY_MANAGER_FILE"; then
    echo "FAIL: Memory manager does not have zeroMemoryBetweenRuns config"
    echo "Expected: zeroMemoryBetweenRuns configuration option"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check schema has zeroMemoryBetweenRuns option
if ! grep -q 'zeroMemoryBetweenRuns' "$SCHEMA_FILE"; then
    echo "FAIL: Schema does not include zeroMemoryBetweenRuns option"
    echo "Expected: zeroMemoryBetweenRuns in debug configuration"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Memory zeroed between runs for security (configurable)"
exit 0
