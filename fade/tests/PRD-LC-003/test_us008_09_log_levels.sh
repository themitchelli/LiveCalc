#!/bin/bash
# Test: US-008 AC-09 - Configurable log level (error, warn, info, debug)
# AC: Configurable log level (error, warn, info, debug)

LOGGER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/logging/logger.ts"
PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for log level methods in logger
for LEVEL in error warn info debug; do
    if ! grep -q "public $LEVEL\|$LEVEL(" "$LOGGER_FILE"; then
        echo "FAIL: Missing $LEVEL log level"
        echo "Expected: $LEVEL method in logger"
        echo "Actual: not found"
        exit 1
    fi
done

# Check for log level configuration
if ! grep -q 'logLevel\|LogLevel' "$LOGGER_FILE"; then
    echo "FAIL: No log level configuration"
    echo "Expected: logLevel property"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Logger has configurable log levels (error, warn, info, debug)"
exit 0
