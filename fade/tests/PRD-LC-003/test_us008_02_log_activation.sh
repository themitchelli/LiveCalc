#!/bin/bash
# Test: US-008 AC-02 - Log extension activation and version
# AC: Log extension activation and version

EXTENSION_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/extension.ts"

if [[ ! -f "$EXTENSION_FILE" ]]; then
    echo "FAIL: Extension file not found"
    exit 1
fi

# Check for activation logging
if ! grep -qi 'activat' "$EXTENSION_FILE"; then
    echo "FAIL: No activation logging"
    echo "Expected: activation log message"
    echo "Actual: not found"
    exit 1
fi

# Check for version logging
if ! grep -q 'version\|Version' "$EXTENSION_FILE"; then
    echo "FAIL: No version logging"
    echo "Expected: version in activation log"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Extension logs activation and version"
exit 0
