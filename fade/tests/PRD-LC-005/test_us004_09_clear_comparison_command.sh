#!/bin/bash
# Test: verify clear comparison command exists
# AC: 'Clear Comparison' button resets to no comparison

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check command exists
if ! grep -q '"command": "livecalc.clearComparison"' "$PACKAGE_JSON"; then
    echo "FAIL: livecalc.clearComparison command not found in package.json"
    echo "Expected: livecalc.clearComparison command to exist"
    exit 1
fi

# Check title
if ! grep -q '"title": "Clear Results Comparison"' "$PACKAGE_JSON"; then
    echo "FAIL: Clear Results Comparison title not found"
    exit 1
fi

echo "PASS: LiveCalc: Clear Results Comparison command exists"
exit 0
