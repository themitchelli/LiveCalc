#!/bin/bash
# Test: US-001 AC-03 - Display name: LiveCalc
# AC: Display name: LiveCalc

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

DISPLAY_NAME=$(grep -o '"displayName":\s*"[^"]*"' "$PACKAGE_JSON" | cut -d'"' -f4)

if [[ "$DISPLAY_NAME" != "LiveCalc" ]]; then
    echo "FAIL: Display name mismatch"
    echo "Expected: LiveCalc"
    echo "Actual: $DISPLAY_NAME"
    exit 1
fi

echo "PASS: Display name is LiveCalc"
exit 0
