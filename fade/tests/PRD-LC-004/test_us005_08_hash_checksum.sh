#!/bin/bash
# Test: verify hash/checksum of assumption data for reproducibility
# AC: Hash/checksum of assumption data for reproducibility

STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"
STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check AssumptionInfo has hash field
if ! grep -q "hash" "$STATE_FILE"; then
    echo "FAIL: hash field not found in AssumptionInfo"
    exit 1
fi

# Check webview displays hash
if ! grep -q "assumption-hash" "$WEBVIEW_FILE"; then
    echo "FAIL: assumption-hash class not used in main.js"
    exit 1
fi

# Check hash is truncated for display (shows first 6 chars)
if ! grep -q "slice(0, 6)" "$WEBVIEW_FILE"; then
    echo "FAIL: hash truncation (slice(0, 6)) not found in main.js"
    exit 1
fi

# Check hash styling exists
if ! grep -q ".assumption-hash" "$STYLES_FILE"; then
    echo "FAIL: .assumption-hash style not found in CSS"
    exit 1
fi

echo "PASS: Hash/checksum of assumption data displayed"
exit 0
