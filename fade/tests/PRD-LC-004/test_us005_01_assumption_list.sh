#!/bin/bash
# Test: verify list of all assumptions used in run is displayed
# AC: List of all assumptions used in run

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has assumptions list container
if ! grep -q "assumptions-list" "$PANEL_FILE"; then
    echo "FAIL: assumptions-list element not found in panel HTML"
    exit 1
fi

if ! grep -q "Assumptions Used" "$PANEL_FILE"; then
    echo "FAIL: 'Assumptions Used' label not found in panel HTML"
    exit 1
fi

# Check AssumptionInfo interface exists
if ! grep -q "interface AssumptionInfo" "$STATE_FILE"; then
    echo "FAIL: AssumptionInfo interface not found"
    exit 1
fi

# Check webview updates assumptions
if ! grep -q "function updateAssumptions" "$WEBVIEW_FILE"; then
    echo "FAIL: updateAssumptions function not found in main.js"
    exit 1
fi

echo "PASS: List of all assumptions used in run"
exit 0
