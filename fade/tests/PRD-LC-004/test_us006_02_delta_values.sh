#!/bin/bash
# Test: verify delta values shown for each statistic
# AC: Delta values shown for each statistic (current vs previous)

STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"
PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check StatisticDelta interface exists
if ! grep -q "interface StatisticDelta" "$STATE_FILE"; then
    echo "FAIL: StatisticDelta interface not found"
    exit 1
fi

# Check calculateComparison function exists
if ! grep -q "export function calculateComparison" "$STATE_FILE"; then
    echo "FAIL: calculateComparison function not found"
    exit 1
fi

# Check HTML has delta elements for each stat
DELTA_IDS=("delta-mean" "delta-stddev" "delta-cte95" "delta-p50" "delta-p75" "delta-p90" "delta-p95" "delta-p99")

for id in "${DELTA_IDS[@]}"; do
    if ! grep -q "$id" "$PANEL_FILE"; then
        echo "FAIL: $id element not found in panel HTML"
        exit 1
    fi
done

# Check webview has showComparison function
if ! grep -q "function showComparison" "$WEBVIEW_FILE"; then
    echo "FAIL: showComparison function not found in main.js"
    exit 1
fi

echo "PASS: Delta values shown for each statistic"
exit 0
