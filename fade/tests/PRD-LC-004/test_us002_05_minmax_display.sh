#!/bin/bash
# Test: verify Min and Max scenario values are displayed
# AC: Min and Max scenario values displayed

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has Min / Max
if ! grep -q "Min / Max" "$PANEL_FILE"; then
    echo "FAIL: 'Min / Max' label not found in panel HTML"
    exit 1
fi

if ! grep -q "stat-minmax" "$PANEL_FILE"; then
    echo "FAIL: stat-minmax element not found in panel HTML"
    exit 1
fi

# Check webview formats min/max together
if ! grep -q "stat-minmax" "$WEBVIEW_FILE"; then
    echo "FAIL: stat-minmax not handled in main.js"
    exit 1
fi

echo "PASS: Min and Max scenario values displayed"
exit 0
