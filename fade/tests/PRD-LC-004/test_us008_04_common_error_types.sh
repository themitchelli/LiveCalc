#!/bin/bash
# Test: verify common errors have specific messages
# AC: Common errors have specific messages: file not found, invalid CSV, timeout, memory limit

ERROR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/error-types.ts"

# Check for error type enum/union
if ! grep -q "LiveCalcErrorType" "$ERROR_FILE"; then
    echo "FAIL: LiveCalcErrorType not found"
    exit 1
fi

# Check for common error types
ERROR_TYPES=("CONFIG_NOT_FOUND" "CONFIG_INVALID" "FILE_NOT_FOUND" "FILE_INVALID" "EXECUTION_TIMEOUT" "MEMORY_LIMIT" "ENGINE_ERROR" "CANCELLED")

for type in "${ERROR_TYPES[@]}"; do
    if ! grep -q "'$type'" "$ERROR_FILE"; then
        echo "FAIL: Error type '$type' not found"
        exit 1
    fi
done

# Check ERROR_TITLES mapping exists for display
if ! grep -q "const ERROR_TITLES" "$ERROR_FILE"; then
    echo "FAIL: ERROR_TITLES mapping not found"
    exit 1
fi

echo "PASS: Common errors have specific types and messages"
exit 0
