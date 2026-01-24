#!/bin/bash
# Test: verify option to pin a specific run as comparison baseline
# AC: Option to pin a specific run as comparison baseline

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
COMPARISON_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/comparison.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has pin comparison button
if ! grep -q "pin-comparison-btn" "$PANEL_FILE"; then
    echo "FAIL: pin-comparison-btn element not found in panel HTML"
    exit 1
fi

if ! grep -q "Pin Baseline" "$PANEL_FILE"; then
    echo "FAIL: 'Pin Baseline' label not found"
    exit 1
fi

# Check ComparisonManager has pinnedBaseline field
if ! grep -q "private pinnedBaseline" "$COMPARISON_FILE"; then
    echo "FAIL: pinnedBaseline field not found"
    exit 1
fi

# Check ComparisonManager has pinBaseline method
if ! grep -q "public async pinBaseline" "$COMPARISON_FILE"; then
    echo "FAIL: pinBaseline method not found"
    exit 1
fi

# Check webview handles pin comparison
if ! grep -q "pinComparison" "$WEBVIEW_FILE"; then
    echo "FAIL: pinComparison handling not found in main.js"
    exit 1
fi

echo "PASS: Option to pin a specific run as comparison baseline"
exit 0
