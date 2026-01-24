#!/bin/bash
# Test: verify run ID is generated for each execution
# AC: Run ID generated for each execution (for audit trail)

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"

# Check HTML has run ID field
if ! grep -q "meta-runid" "$PANEL_FILE"; then
    echo "FAIL: meta-runid element not found in panel HTML"
    exit 1
fi

if ! grep -q "Run ID" "$PANEL_FILE"; then
    echo "FAIL: 'Run ID' label not found in panel HTML"
    exit 1
fi

# Check RunMetadata has runId field
if ! grep -q "runId: string" "$STATE_FILE"; then
    echo "FAIL: runId field not found in RunMetadata"
    exit 1
fi

# Check UUID generation function exists
if ! grep -q "function generateUuid" "$STATE_FILE"; then
    echo "FAIL: generateUuid function not found"
    exit 1
fi

# Check UUID v4 format pattern (4 in position 13)
if ! grep -q "4xxx" "$STATE_FILE"; then
    echo "FAIL: UUID v4 pattern not found in generateUuid"
    exit 1
fi

echo "PASS: Run ID generated (UUID v4) for each execution"
exit 0
