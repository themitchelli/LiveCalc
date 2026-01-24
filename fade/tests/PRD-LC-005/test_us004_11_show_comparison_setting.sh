#!/bin/bash
# Test: verify showComparison setting exists with default true
# AC: Setting: livecalc.showComparison (default: true)

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check setting exists
SETTING=$(grep -A 5 '"livecalc.showComparison"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$SETTING" ]]; then
    echo "FAIL: livecalc.showComparison setting not found in package.json"
    exit 1
fi

# Check type is boolean
if ! echo "$SETTING" | grep -q '"type": "boolean"'; then
    echo "FAIL: livecalc.showComparison should be type boolean"
    exit 1
fi

# Check default is true
if ! echo "$SETTING" | grep -q '"default": true'; then
    echo "FAIL: livecalc.showComparison should have default: true"
    echo "Expected: default: true"
    echo "Actual: $(echo "$SETTING" | grep 'default')"
    exit 1
fi

echo "PASS: livecalc.showComparison setting exists with default true"
exit 0
