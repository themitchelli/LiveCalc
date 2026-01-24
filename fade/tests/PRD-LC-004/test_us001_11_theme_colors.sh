#!/bin/bash
# Test: verify panel uses VS Code theme colors
# AC: Panel uses VS Code theme colors (dark/light aware)

STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check for VS Code CSS variables
# Check for VS Code CSS variables (escape -- for grep)
if ! grep -q "vscode-editor-foreground" "$STYLES_FILE"; then
    echo "FAIL: vscode-editor-foreground not found in styles.css"
    exit 1
fi

if ! grep -q "vscode-editor-background" "$STYLES_FILE"; then
    echo "FAIL: vscode-editor-background not found in styles.css"
    exit 1
fi

if ! grep -q "vscode-button-background" "$STYLES_FILE"; then
    echo "FAIL: vscode-button-background not found in styles.css"
    exit 1
fi

if ! grep -q "vscode-panel-border" "$STYLES_FILE"; then
    echo "FAIL: vscode-panel-border not found in styles.css"
    exit 1
fi

echo "PASS: Panel uses VS Code theme colors"
exit 0
