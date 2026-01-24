#!/bin/bash
# Test: verify scenario configuration (count, seed) is displayed
# AC: Scenario configuration displayed (count, seed)

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"

# Check HTML has scenario count and seed fields
if ! grep -q "meta-scenario-count" "$PANEL_FILE"; then
    echo "FAIL: meta-scenario-count element not found in panel HTML"
    exit 1
fi

if ! grep -q "meta-seed" "$PANEL_FILE"; then
    echo "FAIL: meta-seed element not found in panel HTML"
    exit 1
fi

if ! grep -q "Seed" "$PANEL_FILE"; then
    echo "FAIL: 'Seed' label not found in panel HTML"
    exit 1
fi

# Check RunMetadata has required fields
if ! grep -q "scenarioCount: number" "$STATE_FILE"; then
    echo "FAIL: scenarioCount field not found in RunMetadata"
    exit 1
fi

if ! grep -q "seed: number" "$STATE_FILE"; then
    echo "FAIL: seed field not found in RunMetadata"
    exit 1
fi

echo "PASS: Scenario configuration (count, seed) displayed"
exit 0
