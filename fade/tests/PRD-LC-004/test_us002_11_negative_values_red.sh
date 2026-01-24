#!/bin/bash
# Test: verify negative values shown in red
# AC: Negative values shown in red

STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check for negative value styling in CSS
if ! grep -q ".stat-value.negative" "$STYLES_FILE"; then
    echo "FAIL: .stat-value.negative style not found in CSS"
    exit 1
fi

# Check CSS uses red color variable
if ! grep -q "vscode-charts-red" "$STYLES_FILE"; then
    echo "FAIL: vscode-charts-red color not found in CSS"
    exit 1
fi

# Check webview toggles negative class
if ! grep -q "'negative'" "$WEBVIEW_FILE"; then
    echo "FAIL: 'negative' class toggle not found in main.js"
    exit 1
fi

echo "PASS: Negative values shown in red"
exit 0
