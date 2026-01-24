#!/bin/bash
# Test: verify panel has icon configured
# AC: Panel has LiveCalc icon in tab

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check that iconPath is set
if ! grep -q "this.panel.iconPath = vscode.Uri.joinPath" "$PANEL_FILE"; then
    echo "FAIL: Panel icon not configured"
    echo "Expected: iconPath assignment in results-panel.ts"
    echo "Actual: iconPath not found"
    exit 1
fi

# Check that icon file path references media/icon.png
if ! grep -q "'media', 'icon.png'" "$PANEL_FILE"; then
    echo "FAIL: Panel icon not set to media/icon.png"
    echo "Expected: 'media', 'icon.png'"
    echo "Actual: Pattern not found"
    exit 1
fi

echo "PASS: Panel icon configured correctly"
exit 0
