#!/bin/bash
# Test: verify percentiles P50, P75, P90, P95, P99 are displayed
# AC: Percentiles displayed: P50, P75, P90, P95, P99

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

PERCENTILES=("P50" "P75" "P90" "P95" "P99")

for p in "${PERCENTILES[@]}"; do
    if ! grep -q "$p" "$PANEL_FILE"; then
        echo "FAIL: $p not found in panel HTML"
        exit 1
    fi
done

# Check for corresponding stat elements
STAT_IDS=("stat-p50" "stat-p75" "stat-p90" "stat-p95" "stat-p99")

for id in "${STAT_IDS[@]}"; do
    if ! grep -q "$id" "$PANEL_FILE"; then
        echo "FAIL: $id element not found in panel HTML"
        exit 1
    fi
done

echo "PASS: All percentiles (P50, P75, P90, P95, P99) displayed"
exit 0
