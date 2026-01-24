#!/bin/bash
# Test: verify number of scenarios processed is displayed
# AC: Number of scenarios processed displayed

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has scenarios label
if ! grep -q "Scenarios" "$PANEL_FILE"; then
    echo "FAIL: 'Scenarios' label not found in panel HTML"
    exit 1
fi

if ! grep -q "stat-scenarios" "$PANEL_FILE"; then
    echo "FAIL: stat-scenarios element not found in panel HTML"
    exit 1
fi

# Check webview updates scenario count
if ! grep -q "statScenarios" "$WEBVIEW_FILE"; then
    echo "FAIL: statScenarios not handled in main.js"
    exit 1
fi

echo "PASS: Number of scenarios processed displayed"
exit 0
