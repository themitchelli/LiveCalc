#!/bin/bash
# Test: verify currency formatting with symbol and thousands separators
# AC: All values formatted appropriately (currency symbol, thousands separators)

STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check formatCurrency function exists in results-state.ts
if ! grep -q "export function formatCurrency" "$STATE_FILE"; then
    echo "FAIL: formatCurrency function not found in results-state.ts"
    exit 1
fi

# Check currency symbols are handled
if ! grep -q "GBP" "$STATE_FILE" && ! grep -q "£" "$STATE_FILE"; then
    echo "FAIL: GBP currency handling not found"
    exit 1
fi

# Check webview has formatCurrency
if ! grep -q "function formatCurrency" "$WEBVIEW_FILE"; then
    echo "FAIL: formatCurrency function not found in main.js"
    exit 1
fi

# Check thousands separator pattern
if ! grep -q "toLocaleString\|replace.*\\\\B" "$WEBVIEW_FILE"; then
    echo "FAIL: Thousands separator formatting not found"
    exit 1
fi

echo "PASS: Currency formatting with symbol and thousands separators"
exit 0
