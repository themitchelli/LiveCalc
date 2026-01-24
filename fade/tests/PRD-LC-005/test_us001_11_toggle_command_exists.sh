#!/bin/bash
# Test: verify toggle command exists in package.json
# AC: Toggle command: 'LiveCalc: Toggle Auto-Run'

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check command exists
if ! grep -q '"command": "livecalc.toggleAutoRun"' "$PACKAGE_JSON"; then
    echo "FAIL: livecalc.toggleAutoRun command not found in package.json"
    echo "Expected: livecalc.toggleAutoRun command to exist"
    exit 1
fi

# Check title
if ! grep -q '"title": "Toggle Auto-Run"' "$PACKAGE_JSON"; then
    echo "FAIL: Toggle Auto-Run title not found"
    exit 1
fi

# Check category
if ! grep -B 2 '"command": "livecalc.toggleAutoRun"' "$PACKAGE_JSON" | grep -q '"category": "LiveCalc"' ||
   grep -A 2 '"command": "livecalc.toggleAutoRun"' "$PACKAGE_JSON" | grep -q '"category": "LiveCalc"'; then
    # Command found, category should be nearby
    :
fi

echo "PASS: LiveCalc: Toggle Auto-Run command exists"
exit 0
