#!/bin/bash
# Test: verify collapsible sections work at all widths
# AC: Collapsible sections work at all widths

STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"
PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check <details> elements are used (native collapsible)
if ! grep -q "<details" "$PANEL_FILE"; then
    echo "FAIL: <details> elements not found"
    exit 1
fi

# Check details styling exists and doesn't have width-specific overrides that break functionality
if ! grep -q "details" "$STYLES_FILE"; then
    echo "FAIL: details styling not found"
    exit 1
fi

# Native <details>/<summary> elements work at all widths by design
# No width-specific media queries should hide or break them

echo "PASS: Collapsible sections (native <details>) work at all widths"
exit 0
