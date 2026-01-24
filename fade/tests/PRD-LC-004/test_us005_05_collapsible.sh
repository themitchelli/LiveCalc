#!/bin/bash
# Test: verify assumptions section is collapsible (default: collapsed)
# AC: Collapsible section (default: collapsed)

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check assumptions section uses <details> element
if ! grep -q "<details id=\"assumptions-section\">" "$PANEL_FILE"; then
    echo "FAIL: <details id=\"assumptions-section\"> not found in panel HTML"
    exit 1
fi

# Note: <details> elements are collapsed by default unless they have 'open' attribute
# Check that 'open' attribute is NOT present (default collapsed)
if grep -q "<details id=\"assumptions-section\" open" "$PANEL_FILE"; then
    echo "FAIL: assumptions-section has 'open' attribute (should be collapsed by default)"
    exit 1
fi

echo "PASS: Assumptions section is collapsible (default: collapsed)"
exit 0
