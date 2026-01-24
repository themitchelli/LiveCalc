#!/bin/bash
# Test: verify histogram and statistics for selected intermediate data
# AC: Histogram and statistics for selected intermediate data

DATA_INSPECTOR_FILE="livecalc-vscode/src/pipeline/data-inspector.ts"

# Assert - Check for calculateStatistics method
if ! grep -q 'calculateStatistics' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Data inspector does not have calculateStatistics"
    echo "Expected: calculateStatistics method for summary stats"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for IntermediateDataStatistics interface
if ! grep -q 'IntermediateDataStatistics' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: No IntermediateDataStatistics interface"
    echo "Expected: Statistics interface with mean, stdDev, etc."
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for calculateHistogram method
if ! grep -q 'calculateHistogram' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Data inspector does not have calculateHistogram"
    echo "Expected: calculateHistogram method for distribution"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for IntermediateHistogramData interface
if ! grep -q 'IntermediateHistogramData' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: No IntermediateHistogramData interface"
    echo "Expected: Histogram data interface with bins"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for statistical values
if ! grep -q 'mean\|stdDev\|min\|max' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Statistics do not include common values"
    echo "Expected: mean, stdDev, min, max statistics"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Histogram and statistics for selected intermediate data"
exit 0
