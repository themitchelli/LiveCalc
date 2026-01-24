#!/bin/bash
# Test: verify distribution chart overlay option (current vs previous)
# AC: Distribution chart overlay option (current vs previous)

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has toggle chart overlay button
if ! grep -q "toggle-chart-overlay" "$PANEL_FILE"; then
    echo "FAIL: toggle-chart-overlay element not found in panel HTML"
    exit 1
fi

if ! grep -q "Show Overlay" "$PANEL_FILE"; then
    echo "FAIL: 'Show Overlay' label not found"
    exit 1
fi

# Check webview has showChartOverlay state
if ! grep -q "showChartOverlay" "$WEBVIEW_FILE"; then
    echo "FAIL: showChartOverlay variable not found in main.js"
    exit 1
fi

# Check webview has baseline distribution for overlay
if ! grep -q "baselineDistribution" "$WEBVIEW_FILE"; then
    echo "FAIL: baselineDistribution variable not found in main.js"
    exit 1
fi

# Check chart has second dataset for baseline
if ! grep -q "label: 'Baseline'" "$WEBVIEW_FILE"; then
    echo "FAIL: Baseline dataset label not found"
    exit 1
fi

echo "PASS: Distribution chart overlay option (current vs previous)"
exit 0
