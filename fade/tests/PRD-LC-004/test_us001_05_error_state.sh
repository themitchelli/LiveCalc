#!/bin/bash
# Test: verify panel has error state implementation
# AC: Panel shows error state with message if run fails

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check setError method exists
if ! grep -q "public setError" "$PANEL_FILE"; then
    echo "FAIL: setError method not found in results-panel.ts"
    exit 1
fi

# Check setStructuredError method exists
if ! grep -q "public setStructuredError" "$PANEL_FILE"; then
    echo "FAIL: setStructuredError method not found in results-panel.ts"
    exit 1
fi

# Check error state handling in webview
if ! grep -q "function showError" "$WEBVIEW_FILE"; then
    echo "FAIL: showError function not found in main.js"
    exit 1
fi

# Check error state container exists in HTML template
if ! grep -q "error-state" "$PANEL_FILE"; then
    echo "FAIL: error-state container not found in HTML template"
    exit 1
fi

echo "PASS: Error state implementation found"
exit 0
