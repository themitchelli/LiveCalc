#!/bin/bash
# Test: verify pauseTimeoutMinutes setting exists with correct defaults
# AC: Pause auto-expires after configurable time: livecalc.pauseTimeoutMinutes (default: 30)

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check setting exists
SETTING=$(grep -A 10 '"livecalc.pauseTimeoutMinutes"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$SETTING" ]]; then
    echo "FAIL: livecalc.pauseTimeoutMinutes setting not found in package.json"
    exit 1
fi

# Check type is number
if ! echo "$SETTING" | grep -q '"type": "number"'; then
    echo "FAIL: livecalc.pauseTimeoutMinutes should be type number"
    exit 1
fi

# Check default is 30
if ! echo "$SETTING" | grep -q '"default": 30'; then
    echo "FAIL: livecalc.pauseTimeoutMinutes should have default: 30"
    echo "Expected: default: 30"
    echo "Actual: $(echo "$SETTING" | grep 'default')"
    exit 1
fi

echo "PASS: livecalc.pauseTimeoutMinutes setting exists with default 30"
exit 0
