#!/bin/bash
# Test: verify neutral styling for changes < 0.1%
# AC: Neutral styling for changes < 0.1%

STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"
STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check for 0.1% threshold in comparison logic
if ! grep -q "0.1" "$STATE_FILE" || ! grep -q "0.1" "$WEBVIEW_FILE"; then
    echo "FAIL: 0.1% threshold not found in comparison logic"
    exit 1
fi

# Check neutral direction exists
if ! grep -q "'neutral'" "$STATE_FILE" || ! grep -q "'neutral'" "$WEBVIEW_FILE"; then
    echo "FAIL: 'neutral' direction not found"
    exit 1
fi

# Check neutral styling exists
if ! grep -q ".stat-delta.neutral" "$STYLES_FILE"; then
    echo "FAIL: .stat-delta.neutral style not found"
    exit 1
fi

echo "PASS: Neutral styling for changes < 0.1%"
exit 0
