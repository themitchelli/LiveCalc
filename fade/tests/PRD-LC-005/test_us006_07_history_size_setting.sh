#!/bin/bash
# Test: verify historySize setting exists with correct defaults and bounds
# AC: Setting: livecalc.historySize (default: 10, max: 50)

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check setting exists
SETTING=$(grep -A 10 '"livecalc.historySize"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$SETTING" ]]; then
    echo "FAIL: livecalc.historySize setting not found in package.json"
    exit 1
fi

# Check type is number
if ! echo "$SETTING" | grep -q '"type": "number"'; then
    echo "FAIL: livecalc.historySize should be type number"
    exit 1
fi

# Check default is 10
if ! echo "$SETTING" | grep -q '"default": 10'; then
    echo "FAIL: livecalc.historySize should have default: 10"
    echo "Expected: default: 10"
    echo "Actual: $(echo "$SETTING" | grep 'default')"
    exit 1
fi

# Check minimum is 1
if ! echo "$SETTING" | grep -q '"minimum": 1'; then
    echo "FAIL: livecalc.historySize should have minimum: 1"
    exit 1
fi

# Check maximum is 50
if ! echo "$SETTING" | grep -q '"maximum": 50'; then
    echo "FAIL: livecalc.historySize should have maximum: 50"
    exit 1
fi

echo "PASS: livecalc.historySize setting exists with default 10, min 1, max 50"
exit 0
