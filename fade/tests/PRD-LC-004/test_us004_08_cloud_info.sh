#!/bin/bash
# Test: verify cloud job ID and cost displayed when in cloud mode
# AC: If cloud: job ID and cost displayed

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"

# Check HTML has cloud execution section
if ! grep -q "cloud-execution-section" "$PANEL_FILE"; then
    echo "FAIL: cloud-execution-section not found in panel HTML"
    exit 1
fi

# Check HTML has job ID and cost fields
if ! grep -q "meta-job-id" "$PANEL_FILE"; then
    echo "FAIL: meta-job-id element not found in panel HTML"
    exit 1
fi

if ! grep -q "meta-cost" "$PANEL_FILE"; then
    echo "FAIL: meta-cost element not found in panel HTML"
    exit 1
fi

# Check RunMetadata has optional cloud fields
if ! grep -q "jobId" "$STATE_FILE"; then
    echo "FAIL: jobId field not found in RunMetadata"
    exit 1
fi

if ! grep -q "cost" "$STATE_FILE"; then
    echo "FAIL: cost field not found in RunMetadata"
    exit 1
fi

echo "PASS: Cloud job ID and cost fields available"
exit 0
