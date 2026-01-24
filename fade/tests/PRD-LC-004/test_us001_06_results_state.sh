#!/bin/bash
# Test: verify panel has results state implementation
# AC: Panel shows results state when complete

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check setResults method exists
if ! grep -q "public setResults" "$PANEL_FILE"; then
    echo "FAIL: setResults method not found in results-panel.ts"
    exit 1
fi

# Check results state handling in webview
if ! grep -q "function showResults" "$WEBVIEW_FILE"; then
    echo "FAIL: showResults function not found in main.js"
    exit 1
fi

# Check results state container exists in HTML template
if ! grep -q "results-state" "$PANEL_FILE"; then
    echo "FAIL: results-state container not found in HTML template"
    exit 1
fi

echo "PASS: Results state implementation found"
exit 0
