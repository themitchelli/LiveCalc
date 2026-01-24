#!/bin/bash
# Test: verify notifyOnAutoRun setting exists with correct default and options
# AC: Setting: livecalc.notifyOnAutoRun (default: 'statusBar')

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check setting exists
SETTING=$(grep -A 20 '"livecalc.notifyOnAutoRun"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$SETTING" ]]; then
    echo "FAIL: livecalc.notifyOnAutoRun setting not found in package.json"
    exit 1
fi

# Check type is string
if ! echo "$SETTING" | grep -q '"type": "string"'; then
    echo "FAIL: livecalc.notifyOnAutoRun should be type string"
    exit 1
fi

# Check default is statusBar
if ! echo "$SETTING" | grep -q '"default": "statusBar"'; then
    echo "FAIL: livecalc.notifyOnAutoRun should have default: statusBar"
    echo "Expected: default: statusBar"
    echo "Actual: $(echo "$SETTING" | grep 'default')"
    exit 1
fi

echo "PASS: livecalc.notifyOnAutoRun setting exists with default 'statusBar'"
exit 0
