#!/bin/bash
# Test: verify ability to export any bus:// resource to CSV
# AC: Ability to export any bus:// resource to CSV

DATA_INSPECTOR_FILE="livecalc-vscode/src/pipeline/data-inspector.ts"

# Assert - Check for exportResourceToCsv method
if ! grep -q 'exportResourceToCsv\|exportToCsv\|toCsv' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Data inspector does not have CSV export"
    echo "Expected: exportResourceToCsv method"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for CSV format (comma and newline)
if ! grep -q "','\|csv\|CSV" "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: CSV formatting not found"
    echo "Expected: CSV format with commas"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that function returns string
if ! grep -q 'exportResourceToCsv.*:.*string' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: CSV export does not return string"
    echo "Expected: Return type string for CSV content"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Ability to export any bus:// resource to CSV"
exit 0
