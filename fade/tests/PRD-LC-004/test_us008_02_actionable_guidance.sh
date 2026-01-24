#!/bin/bash
# Test: verify error message includes actionable guidance
# AC: Error message includes actionable guidance where possible

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
ERROR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/error-types.ts"

# Check HTML has guidance element
if ! grep -q "error-guidance" "$PANEL_FILE"; then
    echo "FAIL: error-guidance element not found in panel HTML"
    exit 1
fi

# Check LiveCalcError has guidance field
if ! grep -q "guidance" "$ERROR_FILE"; then
    echo "FAIL: guidance field not found in LiveCalcError"
    exit 1
fi

# Check ERROR_GUIDANCE mapping exists
if ! grep -q "const ERROR_GUIDANCE" "$ERROR_FILE"; then
    echo "FAIL: ERROR_GUIDANCE mapping not found"
    exit 1
fi

# Check guidance is provided for common errors
if ! grep -q "CONFIG_NOT_FOUND:" "$ERROR_FILE"; then
    echo "FAIL: CONFIG_NOT_FOUND guidance not found"
    exit 1
fi

echo "PASS: Error message includes actionable guidance"
exit 0
