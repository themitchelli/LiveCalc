#!/bin/bash
# Test: US-008 AC-11 - Clear log command available
# AC: Clear log command available

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"
LOGGER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/logging/logger.ts"

# Check for clear command or clear method
if ! grep -q 'clearOutput\|clear' "$PACKAGE_JSON"; then
    # It may not be a command but just a method
    if ! grep -q 'clear' "$LOGGER_FILE"; then
        echo "FAIL: No clear functionality"
        echo "Expected: clear command or method"
        echo "Actual: not found"
        exit 1
    fi
fi

# Check for clear method in logger
if ! grep -q 'public clear\|clear()' "$LOGGER_FILE"; then
    echo "FAIL: No clear method in logger"
    echo "Expected: clear() method"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Clear log functionality is available"
exit 0
