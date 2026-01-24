#!/bin/bash
# Test: US-008 AC-07 - Log errors with stack traces (when available)
# AC: Log errors with stack traces (when available)

LOGGER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/logging/logger.ts"

if [[ ! -f "$LOGGER_FILE" ]]; then
    echo "FAIL: Logger file not found"
    exit 1
fi

# Check for error method
if ! grep -q 'public error' "$LOGGER_FILE"; then
    echo "FAIL: No error method in logger"
    echo "Expected: public error() method"
    echo "Actual: not found"
    exit 1
fi

# Check for stack trace handling
if ! grep -q 'stack' "$LOGGER_FILE"; then
    echo "FAIL: No stack trace handling"
    echo "Expected: error.stack handling"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Logger handles errors with stack traces"
exit 0
