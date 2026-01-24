#!/bin/bash
# Test: verify delta formatted as absolute and percentage change
# AC: Delta formatted as absolute and percentage change

STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check StatisticDelta has absolute and percentage fields
if ! grep -q "absolute: number" "$STATE_FILE"; then
    echo "FAIL: absolute field not found in StatisticDelta"
    exit 1
fi

if ! grep -q "percentage: number" "$STATE_FILE"; then
    echo "FAIL: percentage field not found in StatisticDelta"
    exit 1
fi

# Check formatDelta function exists
if ! grep -q "export function formatDelta\|function formatDelta" "$STATE_FILE"; then
    echo "Looking in webview file instead..."
fi

if ! grep -q "function formatDelta" "$WEBVIEW_FILE"; then
    echo "FAIL: formatDelta function not found"
    exit 1
fi

# Check delta shows percentage in parentheses
if ! grep -q "%)" "$WEBVIEW_FILE"; then
    echo "FAIL: Percentage format with ')' not found in formatDelta"
    exit 1
fi

echo "PASS: Delta formatted as absolute and percentage change"
exit 0
