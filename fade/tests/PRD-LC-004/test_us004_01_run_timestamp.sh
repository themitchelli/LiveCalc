#!/bin/bash
# Test: verify run timestamp is displayed
# AC: Run timestamp displayed

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"

# Check HTML has timestamp field
if ! grep -q "meta-timestamp" "$PANEL_FILE"; then
    echo "FAIL: meta-timestamp element not found in panel HTML"
    exit 1
fi

if ! grep -q "Timestamp" "$PANEL_FILE"; then
    echo "FAIL: 'Timestamp' label not found in panel HTML"
    exit 1
fi

# Check RunMetadata has timestamp field
if ! grep -q "timestamp: Date" "$STATE_FILE"; then
    echo "FAIL: timestamp field not found in RunMetadata"
    exit 1
fi

echo "PASS: Run timestamp displayed"
exit 0
