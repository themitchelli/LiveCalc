#!/bin/bash
# Test: verify touch-friendly tap targets (44px minimum)
# AC: Touch-friendly tap targets (44px minimum)

STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check for pointer: coarse media query (touch devices)
if ! grep -q "pointer: coarse" "$STYLES_FILE"; then
    echo "FAIL: @media (pointer: coarse) not found for touch devices"
    exit 1
fi

# Check for 44px minimum height for buttons
if ! grep -q "min-height: 44px" "$STYLES_FILE"; then
    echo "FAIL: min-height: 44px not found for touch targets"
    exit 1
fi

echo "PASS: Touch-friendly tap targets (44px minimum)"
exit 0
