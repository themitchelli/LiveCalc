#!/bin/bash
# Test: verify notifyOnAutoRun has all required options
# AC: Options: 'none', 'statusBar', 'toast', 'sound'

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check setting exists
SETTING=$(grep -A 20 '"livecalc.notifyOnAutoRun"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$SETTING" ]]; then
    echo "FAIL: livecalc.notifyOnAutoRun setting not found"
    exit 1
fi

# Check for enum options
if ! echo "$SETTING" | grep -q '"none"'; then
    echo "FAIL: 'none' option missing from notifyOnAutoRun enum"
    exit 1
fi

if ! echo "$SETTING" | grep -q '"statusBar"'; then
    echo "FAIL: 'statusBar' option missing from notifyOnAutoRun enum"
    exit 1
fi

if ! echo "$SETTING" | grep -q '"toast"'; then
    echo "FAIL: 'toast' option missing from notifyOnAutoRun enum"
    exit 1
fi

if ! echo "$SETTING" | grep -q '"sound"'; then
    echo "FAIL: 'sound' option missing from notifyOnAutoRun enum"
    exit 1
fi

echo "PASS: notifyOnAutoRun has all required options: none, statusBar, toast, sound"
exit 0
