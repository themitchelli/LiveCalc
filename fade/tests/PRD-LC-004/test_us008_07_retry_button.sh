#!/bin/bash
# Test: verify 'Retry' button available after error
# AC: 'Retry' button available after error

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has retry button
if ! grep -q "retry-btn" "$PANEL_FILE"; then
    echo "FAIL: retry-btn element not found in panel HTML"
    exit 1
fi

if ! grep -q "Retry" "$PANEL_FILE"; then
    echo "FAIL: 'Retry' label not found"
    exit 1
fi

# Check retry sends message to run again
if ! grep -q "case 'retry':" "$PANEL_FILE"; then
    echo "FAIL: retry case not handled in results-panel.ts"
    exit 1
fi

# Check retry executes run command
if ! grep -q "livecalc.run" "$PANEL_FILE"; then
    echo "FAIL: livecalc.run command not triggered on retry"
    exit 1
fi

echo "PASS: 'Retry' button available after error"
exit 0
