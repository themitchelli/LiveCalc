#!/bin/bash
# Test: verify statistics grid reflows based on width
# AC: Statistics grid reflows: 3 columns → 2 columns → 1 column

STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check for 3-column layout (large screens)
if ! grep -q "min-width: 800px" "$STYLES_FILE"; then
    echo "FAIL: 800px breakpoint not found"
    exit 1
fi

if ! grep -q "repeat(3, 1fr)" "$STYLES_FILE"; then
    echo "FAIL: 3-column grid layout not found"
    exit 1
fi

# Check for 2-column layout (medium screens)
if ! grep -q "500px" "$STYLES_FILE"; then
    echo "FAIL: 500px breakpoint not found"
    exit 1
fi

if ! grep -q "repeat(2, 1fr)" "$STYLES_FILE"; then
    echo "FAIL: 2-column grid layout not found"
    exit 1
fi

# Check for 1-column layout (small screens)
if ! grep -q "max-width: 499px" "$STYLES_FILE"; then
    echo "FAIL: <500px breakpoint not found"
    exit 1
fi

if ! grep -q "grid-template-columns: 1fr" "$STYLES_FILE"; then
    echo "FAIL: 1-column grid layout not found"
    exit 1
fi

echo "PASS: Statistics grid reflows: 3 → 2 → 1 columns"
exit 0
