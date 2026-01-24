#!/bin/bash
# Test: verify panel has loading state implementation
# AC: Panel shows loading state during execution

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check setLoading method exists in panel
if ! grep -q "public setLoading" "$PANEL_FILE"; then
    echo "FAIL: setLoading method not found in results-panel.ts"
    exit 1
fi

# Check loading state handling in webview
if ! grep -q "function showLoading" "$WEBVIEW_FILE"; then
    echo "FAIL: showLoading function not found in main.js"
    exit 1
fi

# Check loading state container exists in HTML template
if ! grep -q "loading-state" "$PANEL_FILE"; then
    echo "FAIL: loading-state container not found in HTML template"
    exit 1
fi

echo "PASS: Loading state implementation found"
exit 0
