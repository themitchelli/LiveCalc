#!/bin/bash
# Test: verify number of policies processed is displayed
# AC: Number of policies processed displayed

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has policies label
if ! grep -q "Policies" "$PANEL_FILE"; then
    echo "FAIL: 'Policies' label not found in panel HTML"
    exit 1
fi

if ! grep -q "stat-policies" "$PANEL_FILE"; then
    echo "FAIL: stat-policies element not found in panel HTML"
    exit 1
fi

# Check webview updates policy count
if ! grep -q "statPolicies" "$WEBVIEW_FILE"; then
    echo "FAIL: statPolicies not handled in main.js"
    exit 1
fi

echo "PASS: Number of policies processed displayed"
exit 0
