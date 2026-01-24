#!/bin/bash
# Test: verify Mean line is marked on chart
# AC: Mean line marked on chart (vertical dashed line, labeled)

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check for mean annotation
if ! grep -q "meanLine" "$WEBVIEW_FILE"; then
    echo "FAIL: meanLine annotation not found"
    exit 1
fi

# Check mean line is labeled
if ! grep -q "content: 'Mean'" "$WEBVIEW_FILE"; then
    echo "FAIL: Mean label not found in annotation"
    exit 1
fi

# Check mean line is dashed
if ! grep -q "borderDash:" "$WEBVIEW_FILE"; then
    echo "FAIL: borderDash not found for mean line"
    exit 1
fi

echo "PASS: Mean line marked on chart (dashed, labeled)"
exit 0
