#!/bin/bash
# Test: verify debounce delay is configurable via setting
# AC: Debounce delay configurable: livecalc.autoRunDebounceMs

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check setting exists with configurable range
SETTING=$(grep -A 10 '"livecalc.autoRunDebounceMs"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$SETTING" ]]; then
    echo "FAIL: livecalc.autoRunDebounceMs setting not found"
    exit 1
fi

# Check type is number
if ! echo "$SETTING" | grep -q '"type": "number"'; then
    echo "FAIL: livecalc.autoRunDebounceMs should be type number"
    exit 1
fi

# Check minimum bound exists
if ! echo "$SETTING" | grep -q '"minimum": 100'; then
    echo "FAIL: livecalc.autoRunDebounceMs should have minimum: 100"
    exit 1
fi

# Check maximum bound exists
if ! echo "$SETTING" | grep -q '"maximum": 5000'; then
    echo "FAIL: livecalc.autoRunDebounceMs should have maximum: 5000"
    exit 1
fi

echo "PASS: livecalc.autoRunDebounceMs is configurable with proper bounds (100-5000ms)"
exit 0
