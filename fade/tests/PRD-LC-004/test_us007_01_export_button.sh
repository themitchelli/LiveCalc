#!/bin/bash
# Test: verify export button in results panel toolbar
# AC: Export button in results panel toolbar

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check HTML has export button
if ! grep -q "export-btn" "$PANEL_FILE"; then
    echo "FAIL: export-btn element not found in panel HTML"
    exit 1
fi

# Check button is in toolbar section
if ! grep -q "toolbar" "$PANEL_FILE"; then
    echo "FAIL: toolbar section not found in panel HTML"
    exit 1
fi

echo "PASS: Export button in results panel toolbar"
exit 0
