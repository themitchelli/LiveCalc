#!/bin/bash
# Test: verify open results panel command is available
# AC: Command 'LiveCalc: Open Results Panel' available

PACKAGE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for command registration
if ! grep -q '"command": "livecalc.openResults"' "$PACKAGE_FILE"; then
    echo "FAIL: livecalc.openResults command not registered in package.json"
    exit 1
fi

# Check for command title with LiveCalc category
if ! grep -q '"title": "Open Results Panel"' "$PACKAGE_FILE"; then
    echo "FAIL: Open Results Panel title not found"
    exit 1
fi

if ! grep -q '"category": "LiveCalc"' "$PACKAGE_FILE"; then
    echo "FAIL: LiveCalc category not set for commands"
    exit 1
fi

echo "PASS: 'LiveCalc: Open Results Panel' command available"
exit 0
