#!/bin/bash
# Test: verify X-axis has NPV with currency formatting
# AC: X-axis: NPV value with appropriate scale and currency formatting

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check chart x-axis title is NPV
if ! grep -q "text: 'NPV'" "$WEBVIEW_FILE"; then
    echo "FAIL: X-axis title 'NPV' not found"
    exit 1
fi

# Check labels are formatted with currency
if ! grep -q "formatCurrency" "$WEBVIEW_FILE"; then
    echo "FAIL: formatCurrency not used for axis labels"
    exit 1
fi

echo "PASS: X-axis has NPV with currency formatting"
exit 0
