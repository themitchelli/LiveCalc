#!/bin/bash
# Test: verify panel has responsive width styles
# AC: Panel responsive to different widths (min: 400px)

STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check for min-width: 400px
if ! grep -q "min-width: 400px" "$STYLES_FILE"; then
    echo "FAIL: min-width: 400px not found in styles.css"
    exit 1
fi

echo "PASS: Panel has minimum width of 400px"
exit 0
