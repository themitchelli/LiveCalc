#!/bin/bash
# Test: verify debounce setting exists with 500ms default
# AC: Debounce: rapid saves within 500ms only trigger one run

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check setting exists
SETTING=$(grep -A 10 '"livecalc.autoRunDebounceMs"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$SETTING" ]]; then
    echo "FAIL: livecalc.autoRunDebounceMs setting not found in package.json"
    echo "Expected: livecalc.autoRunDebounceMs setting to exist"
    echo "Actual: setting not found"
    exit 1
fi

# Check default is 500
if ! echo "$SETTING" | grep -q '"default": 500'; then
    echo "FAIL: livecalc.autoRunDebounceMs should have default: 500"
    echo "Expected: default: 500"
    echo "Actual: $(echo "$SETTING" | grep 'default')"
    exit 1
fi

echo "PASS: livecalc.autoRunDebounceMs setting exists with default 500ms"
exit 0
