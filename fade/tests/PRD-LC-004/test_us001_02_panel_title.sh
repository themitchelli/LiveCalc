#!/bin/bash
# Test: verify panel title shows 'LiveCalc Results'
# AC: Panel title shows 'LiveCalc Results'

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check that panel is created with 'LiveCalc Results' title
if ! grep -q "'LiveCalc Results'" "$PANEL_FILE"; then
    echo "FAIL: Panel title not set to 'LiveCalc Results'"
    echo "Expected: 'LiveCalc Results'"
    echo "Actual: Pattern not found in results-panel.ts"
    exit 1
fi

echo "PASS: Panel title set to 'LiveCalc Results'"
exit 0
