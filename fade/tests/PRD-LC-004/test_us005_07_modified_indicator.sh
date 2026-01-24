#!/bin/bash
# Test: verify visual indicator if assumption file modified since run started
# AC: Visual indicator if assumption file modified since run started

STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"
STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check AssumptionInfo has modified field
if ! grep -q "modified" "$STATE_FILE"; then
    echo "FAIL: modified field not found in AssumptionInfo"
    exit 1
fi

# Check webview handles modified indicator
if ! grep -q "assumption-modified" "$WEBVIEW_FILE"; then
    echo "FAIL: assumption-modified class not used in main.js"
    exit 1
fi

# Check modified styling exists
if ! grep -q ".assumption-modified" "$STYLES_FILE"; then
    echo "FAIL: .assumption-modified style not found in CSS"
    exit 1
fi

echo "PASS: Visual indicator for modified assumption files"
exit 0
