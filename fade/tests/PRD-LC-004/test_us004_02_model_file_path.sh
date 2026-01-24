#!/bin/bash
# Test: verify model file path is displayed
# AC: Model file path displayed

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"

# Check HTML has model field
if ! grep -q "meta-model" "$PANEL_FILE"; then
    echo "FAIL: meta-model element not found in panel HTML"
    exit 1
fi

if ! grep -q "Model File" "$PANEL_FILE"; then
    echo "FAIL: 'Model File' label not found in panel HTML"
    exit 1
fi

# Check RunMetadata has modelFile field
if ! grep -q "modelFile: string" "$STATE_FILE"; then
    echo "FAIL: modelFile field not found in RunMetadata"
    exit 1
fi

echo "PASS: Model file path displayed"
exit 0
