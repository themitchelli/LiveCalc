#!/bin/bash
# Test: US-008 AC-10 - Setting: livecalc.logLevel (default: info)
# AC: Setting: livecalc.logLevel (default: info)

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for logLevel setting
if ! grep -q '"livecalc.logLevel"' "$PACKAGE_JSON"; then
    echo "FAIL: No livecalc.logLevel setting"
    echo "Expected: livecalc.logLevel in configuration"
    echo "Actual: not found"
    exit 1
fi

# Check for default value 'info' (handle whitespace variations)
if ! grep -A10 '"livecalc.logLevel"' "$PACKAGE_JSON" | grep -q '"default".*"info"'; then
    echo "FAIL: logLevel default is not 'info'"
    echo "Expected: default: info"
    echo "Actual: different default"
    exit 1
fi

# Check for enum values
for LEVEL in error warn info debug; do
    if ! grep -A15 '"livecalc.logLevel"' "$PACKAGE_JSON" | grep -q "\"$LEVEL\""; then
        echo "FAIL: Missing log level option: $LEVEL"
        echo "Expected: $LEVEL in enum"
        echo "Actual: not found"
        exit 1
    fi
done

echo "PASS: livecalc.logLevel setting configured with info default"
exit 0
