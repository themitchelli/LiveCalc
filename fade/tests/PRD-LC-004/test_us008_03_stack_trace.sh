#!/bin/bash
# Test: verify stack trace available in expandable section
# AC: Stack trace available in expandable section (for debugging)

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
ERROR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/error-types.ts"

# Check HTML has error details container (expandable)
if ! grep -q "error-details-container" "$PANEL_FILE"; then
    echo "FAIL: error-details-container not found in panel HTML"
    exit 1
fi

# Check it uses <details> element for expandable
if ! grep -q "<details" "$PANEL_FILE"; then
    echo "FAIL: <details> element not found for expandable section"
    exit 1
fi

# Check summary says "Stack Trace"
if ! grep -q "Stack Trace" "$PANEL_FILE"; then
    echo "FAIL: 'Stack Trace' summary text not found"
    exit 1
fi

# Check LiveCalcError has details field
if ! grep -q "details" "$ERROR_FILE"; then
    echo "FAIL: details field not found in LiveCalcError"
    exit 1
fi

echo "PASS: Stack trace available in expandable section"
exit 0
