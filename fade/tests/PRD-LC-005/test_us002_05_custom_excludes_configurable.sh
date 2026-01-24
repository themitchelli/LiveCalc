#!/bin/bash
# Test: verify custom excludes are configurable
# AC: Custom excludes configurable: livecalc.watchExclude

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check setting exists
SETTING=$(grep -A 15 '"livecalc.watchExclude"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$SETTING" ]]; then
    echo "FAIL: livecalc.watchExclude setting not found"
    exit 1
fi

# Check type is array
if ! echo "$SETTING" | grep -q '"type": "array"'; then
    echo "FAIL: livecalc.watchExclude should be type array"
    exit 1
fi

# Check items type is string
if ! echo "$SETTING" | grep -q '"type": "string"'; then
    echo "FAIL: livecalc.watchExclude items should be type string"
    exit 1
fi

echo "PASS: livecalc.watchExclude is configurable as string array"
exit 0
