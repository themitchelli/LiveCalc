#!/bin/bash
# Test: verify option to toggle between histogram and density plot
# AC: Option to toggle between histogram and density plot

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"
PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check toggle button exists in HTML
if ! grep -q "toggle-chart-type" "$PANEL_FILE"; then
    echo "FAIL: toggle-chart-type button not found in panel HTML"
    exit 1
fi

# Check for chartType variable
if ! grep -q "let chartType = 'histogram'" "$WEBVIEW_FILE"; then
    echo "FAIL: chartType variable not found"
    exit 1
fi

# Check for toggle logic that switches types
if ! grep -q "chartType === 'histogram'" "$WEBVIEW_FILE"; then
    echo "FAIL: chartType toggle check not found"
    exit 1
fi

# Check for density chart update function
if ! grep -q "function updateDensityChart" "$WEBVIEW_FILE"; then
    echo "FAIL: updateDensityChart function not found"
    exit 1
fi

# Check for KDE calculation
if ! grep -q "function calculateKDE" "$WEBVIEW_FILE"; then
    echo "FAIL: calculateKDE function not found"
    exit 1
fi

echo "PASS: Toggle between histogram and density plot implemented"
exit 0
