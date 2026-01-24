#!/bin/bash
# Test: verify livecalc.autoRunOnSave setting exists with default true
# AC: Setting: livecalc.autoRunOnSave (default: true)

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check setting exists
SETTING=$(grep -A 5 '"livecalc.autoRunOnSave"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$SETTING" ]]; then
    echo "FAIL: livecalc.autoRunOnSave setting not found in package.json"
    echo "Expected: livecalc.autoRunOnSave setting to exist"
    echo "Actual: setting not found"
    exit 1
fi

# Check type is boolean
if ! echo "$SETTING" | grep -q '"type": "boolean"'; then
    echo "FAIL: livecalc.autoRunOnSave should be type boolean"
    exit 1
fi

# Check default is true
if ! echo "$SETTING" | grep -q '"default": true'; then
    echo "FAIL: livecalc.autoRunOnSave should have default: true"
    echo "Expected: default: true"
    echo "Actual: $(echo "$SETTING" | grep 'default')"
    exit 1
fi

echo "PASS: livecalc.autoRunOnSave setting exists with default true"
exit 0
