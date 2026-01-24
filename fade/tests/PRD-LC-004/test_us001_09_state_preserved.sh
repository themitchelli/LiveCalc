#!/bin/bash
# Test: verify panel state is preserved when hidden
# AC: Panel state preserved when switching editor tabs

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check retainContextWhenHidden is set to true
if ! grep -q "retainContextWhenHidden: true" "$PANEL_FILE"; then
    echo "FAIL: retainContextWhenHidden not set to true"
    echo "Expected: retainContextWhenHidden: true"
    echo "Actual: Setting not found"
    exit 1
fi

echo "PASS: Panel state preserved when hidden (retainContextWhenHidden: true)"
exit 0
