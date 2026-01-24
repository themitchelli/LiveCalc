#!/bin/bash
# Test: verify CTE 95 is displayed
# AC: CTE 95 (Conditional Tail Expectation) displayed

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check HTML has CTE 95
if ! grep -q "CTE 95" "$PANEL_FILE"; then
    echo "FAIL: 'CTE 95' label not found in panel HTML"
    exit 1
fi

if ! grep -q "stat-cte95" "$PANEL_FILE"; then
    echo "FAIL: stat-cte95 element not found in panel HTML"
    exit 1
fi

echo "PASS: CTE 95 displayed"
exit 0
