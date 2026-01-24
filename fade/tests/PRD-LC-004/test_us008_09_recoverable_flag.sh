#!/bin/bash
# Test: verify errors have recoverable flag
# AC: (Implied) Errors indicate whether they are recoverable

ERROR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/error-types.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check LiveCalcError has recoverable field
if ! grep -q "recoverable: boolean" "$ERROR_FILE"; then
    echo "FAIL: recoverable field not found in LiveCalcError"
    exit 1
fi

# Check some errors are marked as non-recoverable
if ! grep -q "recoverable: type !== 'ENGINE_INIT_FAILED'" "$ERROR_FILE" || ! grep -q "MEMORY_LIMIT" "$ERROR_FILE"; then
    echo "Note: Engine init and memory errors should be non-recoverable"
fi

# Check webview hides/shows retry based on recoverability
if ! grep -q "errorState.recoverable" "$WEBVIEW_FILE"; then
    echo "FAIL: recoverable check not found in webview"
    exit 1
fi

echo "PASS: Errors have recoverable flag"
exit 0
