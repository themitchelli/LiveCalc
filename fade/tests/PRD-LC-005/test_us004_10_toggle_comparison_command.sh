#!/bin/bash
# Test: verify toggle comparison command exists
# AC: Comparison mode toggle: 'LiveCalc: Toggle Comparison'

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check command exists
if ! grep -q '"command": "livecalc.toggleComparison"' "$PACKAGE_JSON"; then
    echo "FAIL: livecalc.toggleComparison command not found in package.json"
    echo "Expected: livecalc.toggleComparison command to exist"
    exit 1
fi

# Check title
if ! grep -q '"title": "Toggle Comparison"' "$PACKAGE_JSON"; then
    echo "FAIL: Toggle Comparison title not found"
    exit 1
fi

echo "PASS: LiveCalc: Toggle Comparison command exists"
exit 0
