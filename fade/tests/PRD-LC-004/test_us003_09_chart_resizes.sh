#!/bin/bash
# Test: verify chart resizes with panel width
# AC: Chart resizes with panel width

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"
STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check Chart.js responsive option is enabled
if ! grep -q "responsive: true" "$WEBVIEW_FILE"; then
    echo "FAIL: Chart.js responsive option not enabled"
    exit 1
fi

# Check chart container has 100% width
if ! grep -q "width: 100%" "$STYLES_FILE"; then
    echo "FAIL: Chart container width: 100% not found"
    exit 1
fi

echo "PASS: Chart resizes with panel width"
exit 0
