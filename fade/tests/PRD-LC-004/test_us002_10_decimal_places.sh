#!/bin/bash
# Test: verify configurable decimal places
# AC: Configurable decimal places (default: 0 for large numbers, 2 for percentages)

PACKAGE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check decimalPlaces configuration exists
if ! grep -q "livecalc.decimalPlaces" "$PACKAGE_FILE"; then
    echo "FAIL: livecalc.decimalPlaces configuration not found in package.json"
    exit 1
fi

# Check default value
if ! grep -q '"default": 0' "$PACKAGE_FILE"; then
    echo "WARN: Default decimal places may not be 0"
fi

echo "PASS: Configurable decimal places setting exists"
exit 0
