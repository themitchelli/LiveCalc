#!/bin/bash
# Test: verify export dropdown with format options
# AC: Export dropdown with format options

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has export dropdown menu
if ! grep -q "export-menu" "$PANEL_FILE"; then
    echo "FAIL: export-menu element not found in panel HTML"
    exit 1
fi

if ! grep -q "dropdown-menu" "$PANEL_FILE"; then
    echo "FAIL: dropdown-menu class not found in panel HTML"
    exit 1
fi

# Check dropdown has format buttons
if ! grep -q 'data-format="csv"' "$PANEL_FILE"; then
    echo "FAIL: CSV format option not found"
    exit 1
fi

if ! grep -q 'data-format="json"' "$PANEL_FILE"; then
    echo "FAIL: JSON format option not found"
    exit 1
fi

if ! grep -q 'data-format="clipboard"' "$PANEL_FILE"; then
    echo "FAIL: Clipboard format option not found"
    exit 1
fi

echo "PASS: Export dropdown with format options"
exit 0
