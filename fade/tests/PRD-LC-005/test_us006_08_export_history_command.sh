#!/bin/bash
# Test: verify export history to CSV command exists
# AC: Export history to CSV option

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check command exists
if ! grep -q '"command": "livecalc.exportHistory"' "$PACKAGE_JSON"; then
    echo "FAIL: livecalc.exportHistory command not found in package.json"
    echo "Expected: livecalc.exportHistory command to exist"
    exit 1
fi

# Check title
if ! grep -q '"title": "Export Run History to CSV"' "$PACKAGE_JSON"; then
    echo "FAIL: Export Run History to CSV title not found"
    exit 1
fi

echo "PASS: LiveCalc: Export Run History to CSV command exists"
exit 0
