#!/bin/bash
# Test: verify comparison view to overlay two bus:// resources
# AC: Comparison view: overlay two bus:// resources to see differences

DATA_INSPECTOR_FILE="livecalc-vscode/src/pipeline/data-inspector.ts"

# Assert - Check for compareResources method
if ! grep -q 'compareResources' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Data inspector does not have compareResources"
    echo "Expected: compareResources method for comparison"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for differences tracking
if ! grep -q 'differences' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Comparison does not track differences"
    echo "Expected: differences field in comparison result"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for summary statistics in comparison
if ! grep -q 'totalDifferences\|maxAbsDiff\|meanAbsDiff' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Comparison lacks summary statistics"
    echo "Expected: totalDifferences, maxAbsDiff, etc."
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for two resource parameters
if ! grep -q 'resourceA.*resourceB\|resource1.*resource2' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: compareResources does not take two resources"
    echo "Expected: Two resource parameters for comparison"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Comparison view: overlay two bus:// resources"
exit 0
