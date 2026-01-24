#!/bin/bash
# Test: verify chart uses theme-appropriate colors
# AC: Chart uses theme-appropriate colors

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check chart gets colors from computed style (CSS variables)
if ! grep -q "getComputedStyle" "$WEBVIEW_FILE"; then
    echo "FAIL: getComputedStyle not used to get theme colors"
    exit 1
fi

# Check for VS Code color variables
if ! grep -q "vscode-editor-foreground\|vscode-panel-border" "$WEBVIEW_FILE"; then
    echo "FAIL: VS Code color variables not used in chart"
    exit 1
fi

echo "PASS: Chart uses theme-appropriate colors"
exit 0
