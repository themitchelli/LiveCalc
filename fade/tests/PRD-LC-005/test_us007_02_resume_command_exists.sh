#!/bin/bash
# Test: verify resume auto-run command exists
# AC: Command: 'LiveCalc: Resume Auto-Run'

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check command exists
if ! grep -q '"command": "livecalc.resumeAutoRun"' "$PACKAGE_JSON"; then
    echo "FAIL: livecalc.resumeAutoRun command not found in package.json"
    echo "Expected: livecalc.resumeAutoRun command to exist"
    exit 1
fi

# Check title
if ! grep -q '"title": "Resume Auto-Run"' "$PACKAGE_JSON"; then
    echo "FAIL: Resume Auto-Run title not found"
    exit 1
fi

echo "PASS: LiveCalc: Resume Auto-Run command exists"
exit 0
