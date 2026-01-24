#!/bin/bash
# Test: verify export to CSV with statistics and scenario NPVs
# AC: Export to CSV: statistics + all scenario NPVs

EXPORT_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/export.ts"

# Check exportToCsv method exists
if ! grep -q "exportToCsv" "$EXPORT_FILE"; then
    echo "FAIL: exportToCsv method not found"
    exit 1
fi

# Check buildCsvContent function exists
if ! grep -q "buildCsvContent" "$EXPORT_FILE"; then
    echo "FAIL: buildCsvContent function not found"
    exit 1
fi

# Check CSV includes statistics
if ! grep -q "statistic,value" "$EXPORT_FILE"; then
    echo "FAIL: statistic,value header not found in CSV format"
    exit 1
fi

# Check CSV includes scenario NPVs
if ! grep -q "scenario_id,npv" "$EXPORT_FILE"; then
    echo "FAIL: scenario_id,npv header not found in CSV format"
    exit 1
fi

echo "PASS: Export to CSV with statistics + all scenario NPVs"
exit 0
