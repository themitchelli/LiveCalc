#!/bin/bash
# Test: verify tooltips show bin range and count on hover
# AC: Tooltips show bin range and count on hover

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check for tooltip callbacks configuration
if ! grep -q "tooltip:" "$WEBVIEW_FILE"; then
    echo "FAIL: tooltip configuration not found"
    exit 1
fi

if ! grep -q "callbacks:" "$WEBVIEW_FILE"; then
    echo "FAIL: tooltip callbacks not found"
    exit 1
fi

# Check tooltip shows count
if ! grep -q "Count:" "$WEBVIEW_FILE"; then
    echo "FAIL: Count display in tooltip not found"
    exit 1
fi

# Check tooltip shows bin range (uses formatCurrency for range)
if ! grep -q "binStart\|binEnd\|binCenter" "$WEBVIEW_FILE"; then
    echo "FAIL: Bin range calculation not found in tooltip"
    exit 1
fi

echo "PASS: Tooltips show bin range and count on hover"
exit 0
