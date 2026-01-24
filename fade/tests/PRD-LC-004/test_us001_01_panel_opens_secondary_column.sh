#!/bin/bash
# Test: verify panel configuration opens in secondary column
# AC: Results panel opens in editor area (secondary column by default)

# This test verifies the code is configured to open panel in ViewColumn.Two

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check that ViewColumn.Two is used in createPanel
if ! grep -q "viewColumn: vscode.ViewColumn.Two" "$PANEL_FILE"; then
    echo "FAIL: Panel not configured to open in ViewColumn.Two (secondary column)"
    echo "Expected: viewColumn: vscode.ViewColumn.Two"
    echo "Actual: Pattern not found in results-panel.ts"
    exit 1
fi

echo "PASS: Panel configured to open in secondary column (ViewColumn.Two)"
exit 0
