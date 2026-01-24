#!/bin/bash
# Test: verify chart maintains aspect ratio and readability
# AC: Chart maintains aspect ratio and readability

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"
STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check Chart.js has maintainAspectRatio option
if ! grep -q "maintainAspectRatio:" "$WEBVIEW_FILE"; then
    echo "FAIL: maintainAspectRatio option not found in chart config"
    exit 1
fi

# Check Chart.js responsive is enabled
if ! grep -q "responsive: true" "$WEBVIEW_FILE"; then
    echo "FAIL: responsive: true not found in chart config"
    exit 1
fi

# Check chart container has width: 100%
if ! grep -q ".chart-container" "$STYLES_FILE"; then
    echo "FAIL: .chart-container style not found"
    exit 1
fi

echo "PASS: Chart maintains aspect ratio and readability"
exit 0
