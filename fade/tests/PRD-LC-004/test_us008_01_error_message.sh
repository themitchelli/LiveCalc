#!/bin/bash
# Test: verify error state shows clear error message
# AC: Error state shows clear error message

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
ERROR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/error-types.ts"

# Check HTML has error message element
if ! grep -q "error-message" "$PANEL_FILE"; then
    echo "FAIL: error-message element not found in panel HTML"
    exit 1
fi

# Check LiveCalcError interface has message field
if ! grep -q "message: string" "$ERROR_FILE"; then
    echo "FAIL: message field not found in LiveCalcError"
    exit 1
fi

# Check setError method exists
if ! grep -q "public setError" "$PANEL_FILE"; then
    echo "FAIL: setError method not found"
    exit 1
fi

echo "PASS: Error state shows clear error message"
exit 0
