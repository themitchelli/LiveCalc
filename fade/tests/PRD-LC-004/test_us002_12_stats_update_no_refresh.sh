#!/bin/bash
# Test: verify statistics update without full page refresh
# AC: Statistics update without full page refresh

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check for updateStatistics function that updates individual elements
if ! grep -q "function updateStatistics" "$WEBVIEW_FILE"; then
    echo "FAIL: updateStatistics function not found"
    exit 1
fi

# Check that it updates individual DOM elements (not full innerHTML replacement)
if ! grep -q "getElementById.*textContent" "$WEBVIEW_FILE"; then
    echo "FAIL: Individual element update pattern not found"
    exit 1
fi

# Check for setStatValue helper
if ! grep -q "function setStatValue" "$WEBVIEW_FILE"; then
    echo "FAIL: setStatValue helper function not found"
    exit 1
fi

echo "PASS: Statistics update without full page refresh"
exit 0
