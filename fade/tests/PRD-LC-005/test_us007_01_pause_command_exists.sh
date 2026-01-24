#!/bin/bash
# Test: verify pause auto-run command exists
# AC: Command: 'LiveCalc: Pause Auto-Run'

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check command exists
if ! grep -q '"command": "livecalc.pauseAutoRun"' "$PACKAGE_JSON"; then
    echo "FAIL: livecalc.pauseAutoRun command not found in package.json"
    echo "Expected: livecalc.pauseAutoRun command to exist"
    exit 1
fi

# Check title
if ! grep -q '"title": "Pause Auto-Run"' "$PACKAGE_JSON"; then
    echo "FAIL: Pause Auto-Run title not found"
    exit 1
fi

echo "PASS: LiveCalc: Pause Auto-Run command exists"
exit 0
