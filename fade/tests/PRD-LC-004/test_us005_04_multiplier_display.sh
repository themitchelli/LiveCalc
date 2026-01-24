#!/bin/bash
# Test: verify assumption multipliers shown if applied
# AC: Assumption multipliers shown if applied (e.g., 'Mortality: 1.1x')

STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"
STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check AssumptionInfo has multiplier field
if ! grep -q "multiplier" "$STATE_FILE"; then
    echo "FAIL: multiplier field not found in AssumptionInfo"
    exit 1
fi

# Check webview displays multiplier
if ! grep -q "assumption-multiplier" "$WEBVIEW_FILE"; then
    echo "FAIL: assumption-multiplier class not used in main.js"
    exit 1
fi

# Check multiplier shows "x" suffix
if ! grep -q "}x\`" "$WEBVIEW_FILE" || ! grep -q "x<" "$WEBVIEW_FILE"; then
    echo "WARN: multiplier 'x' suffix display pattern may differ"
fi

# Check multiplier styling exists
if ! grep -q ".assumption-multiplier" "$STYLES_FILE"; then
    echo "FAIL: .assumption-multiplier style not found"
    exit 1
fi

echo "PASS: Assumption multipliers shown if applied"
exit 0
