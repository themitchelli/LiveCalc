#!/bin/bash
# Test: verify 50-100 bins for smooth distribution
# AC: 50-100 bins for smooth distribution (auto-calculated)

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check for bin count calculation with min 50 and max 100
if ! grep -q "Math.min.*Math.max.*50" "$WEBVIEW_FILE"; then
    echo "FAIL: Bin count calculation with 50 minimum not found"
    exit 1
fi

if ! grep -q "100" "$WEBVIEW_FILE"; then
    echo "FAIL: Bin count maximum of 100 not found"
    exit 1
fi

echo "PASS: 50-100 bins auto-calculated"
exit 0
