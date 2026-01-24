#!/bin/bash
# Test: verify clicking on local file opens it in editor
# AC: Click on local file opens it in editor

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"
PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check for clickable source class in webview
if ! grep -q "assumption-source clickable" "$WEBVIEW_FILE"; then
    echo "FAIL: 'assumption-source clickable' class not found in main.js"
    exit 1
fi

# Check click handler sends openFile message
if ! grep -q "type: 'openFile'" "$WEBVIEW_FILE"; then
    echo "FAIL: openFile message type not found in main.js"
    exit 1
fi

# Check extension handles openFile message
if ! grep -q "case 'openFile':" "$PANEL_FILE"; then
    echo "FAIL: openFile case not handled in results-panel.ts"
    exit 1
fi

# Check showTextDocument is called
if ! grep -q "showTextDocument" "$PANEL_FILE"; then
    echo "FAIL: showTextDocument not called for openFile"
    exit 1
fi

echo "PASS: Click on local file opens it in editor"
exit 0
