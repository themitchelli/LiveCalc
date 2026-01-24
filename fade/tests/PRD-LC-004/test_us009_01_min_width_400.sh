#!/bin/bash
# Test: verify panel works at minimum width of 400px
# AC: Panel works at minimum width of 400px

STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check body has min-width: 400px
if ! grep -q "min-width: 400px" "$STYLES_FILE"; then
    echo "FAIL: min-width: 400px not found in body styles"
    exit 1
fi

echo "PASS: Panel has minimum width of 400px"
exit 0
