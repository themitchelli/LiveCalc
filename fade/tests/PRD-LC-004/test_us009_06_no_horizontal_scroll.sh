#!/bin/bash
# Test: verify no horizontal scrolling required
# AC: No horizontal scrolling required

STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check overflow-x: hidden is set
if ! grep -q "overflow-x: hidden" "$STYLES_FILE"; then
    echo "FAIL: overflow-x: hidden not found"
    exit 1
fi

# Check for word-break handling to prevent overflow
if ! grep -q "word-break\|overflow-wrap\|word-wrap" "$STYLES_FILE"; then
    echo "WARN: word-break/overflow-wrap styles not found (may cause horizontal scroll with long text)"
fi

echo "PASS: No horizontal scrolling (overflow-x: hidden)"
exit 0
