#!/bin/bash
# Test: verify Standard Deviation is displayed
# AC: Standard deviation displayed

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has stddev stat card
if ! grep -q "Standard Deviation" "$PANEL_FILE"; then
    echo "FAIL: 'Standard Deviation' label not found in panel HTML"
    exit 1
fi

if ! grep -q "stat-stddev" "$PANEL_FILE"; then
    echo "FAIL: stat-stddev element not found in panel HTML"
    exit 1
fi

# Check webview updates stddev
if ! grep -q "stat-stddev" "$WEBVIEW_FILE"; then
    echo "FAIL: stat-stddev not updated in main.js"
    exit 1
fi

echo "PASS: Standard deviation displayed"
exit 0
