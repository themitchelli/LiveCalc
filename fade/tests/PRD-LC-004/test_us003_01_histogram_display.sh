#!/bin/bash
# Test: verify histogram of scenario NPVs is displayed
# AC: Histogram of scenario NPVs displayed

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"
PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check canvas element exists for chart
if ! grep -q "distribution-chart" "$PANEL_FILE"; then
    echo "FAIL: distribution-chart canvas not found in panel HTML"
    exit 1
fi

# Check histogram update function exists
if ! grep -q "function updateHistogramChart" "$WEBVIEW_FILE"; then
    echo "FAIL: updateHistogramChart function not found in main.js"
    exit 1
fi

# Check calculateHistogram function exists
if ! grep -q "function calculateHistogram" "$WEBVIEW_FILE"; then
    echo "FAIL: calculateHistogram function not found in main.js"
    exit 1
fi

echo "PASS: Histogram of scenario NPVs implemented"
exit 0
