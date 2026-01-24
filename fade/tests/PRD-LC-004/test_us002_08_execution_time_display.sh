#!/bin/bash
# Test: verify execution time is displayed
# AC: Execution time displayed (e.g., '2.3 seconds')

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has execution time label
if ! grep -q "Execution Time" "$PANEL_FILE"; then
    echo "FAIL: 'Execution Time' label not found in panel HTML"
    exit 1
fi

if ! grep -q "stat-exectime" "$PANEL_FILE"; then
    echo "FAIL: stat-exectime element not found in panel HTML"
    exit 1
fi

# Check webview has formatDuration function
if ! grep -q "function formatDuration" "$WEBVIEW_FILE"; then
    echo "FAIL: formatDuration function not found in main.js"
    exit 1
fi

echo "PASS: Execution time displayed"
exit 0
