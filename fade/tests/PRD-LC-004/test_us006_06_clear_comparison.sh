#!/bin/bash
# Test: verify 'Clear Comparison' button to reset baseline
# AC: 'Clear Comparison' button to reset baseline

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
COMPARISON_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/comparison.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has clear comparison button
if ! grep -q "clear-comparison-btn" "$PANEL_FILE"; then
    echo "FAIL: clear-comparison-btn element not found in panel HTML"
    exit 1
fi

if ! grep -q "Clear Comparison" "$PANEL_FILE"; then
    echo "FAIL: 'Clear Comparison' label not found"
    exit 1
fi

# Check ComparisonManager has clearComparison method
if ! grep -q "public async clearComparison" "$COMPARISON_FILE"; then
    echo "FAIL: clearComparison method not found"
    exit 1
fi

# Check webview handles clear comparison
if ! grep -q "clearComparison" "$WEBVIEW_FILE"; then
    echo "FAIL: clearComparison handling not found in main.js"
    exit 1
fi

echo "PASS: 'Clear Comparison' button to reset baseline"
exit 0
