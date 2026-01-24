#!/bin/bash
# Test: verify Y-axis shows frequency
# AC: Y-axis: Frequency (count of scenarios)

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check chart y-axis title is Frequency
if ! grep -q "text: 'Frequency'" "$WEBVIEW_FILE"; then
    echo "FAIL: Y-axis title 'Frequency' not found"
    exit 1
fi

echo "PASS: Y-axis shows Frequency"
exit 0
