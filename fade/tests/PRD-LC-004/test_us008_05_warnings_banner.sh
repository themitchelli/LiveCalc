#!/bin/bash
# Test: verify warnings displayed in yellow banner
# AC: Warnings displayed in yellow banner (non-fatal issues)

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has warnings banner
if ! grep -q "warnings-banner" "$PANEL_FILE"; then
    echo "FAIL: warnings-banner element not found in panel HTML"
    exit 1
fi

# Check setWarnings method exists
if ! grep -q "public setWarnings" "$PANEL_FILE"; then
    echo "FAIL: setWarnings method not found"
    exit 1
fi

# Check warnings banner has yellow/warning styling
if ! grep -q ".warnings-banner" "$STYLES_FILE"; then
    echo "FAIL: .warnings-banner style not found"
    exit 1
fi

# Check warning color variable is used
if ! grep -q "warningBackground\|warningBorder\|charts-orange" "$STYLES_FILE"; then
    echo "FAIL: Warning color styling not found"
    exit 1
fi

# Check webview handles warnings
if ! grep -q "function showWarnings" "$WEBVIEW_FILE"; then
    echo "FAIL: showWarnings function not found in main.js"
    exit 1
fi

echo "PASS: Warnings displayed in yellow banner"
exit 0
