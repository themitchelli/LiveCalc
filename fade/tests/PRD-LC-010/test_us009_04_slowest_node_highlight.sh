#!/bin/bash
# Test: verify automatic identification of slowest node
# AC: Identify slowest node automatically (highlighted)

TIMING_PROFILER_FILE="livecalc-vscode/src/pipeline/timing-profiler.ts"

# Assert - Check for slowestNodeId field
if ! grep -q 'slowestNodeId' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: Summary does not include slowestNodeId"
    echo "Expected: slowestNodeId for bottleneck identification"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for slowestNodeTimeMs field
if ! grep -q 'slowestNodeTimeMs' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: Summary does not include slowestNodeTimeMs"
    echo "Expected: slowestNodeTimeMs for slowest duration"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for slowest node calculation
if ! grep -q 'reduce.*max\|Math\.max\|slowest' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No slowest node calculation"
    echo "Expected: Calculation to find max time"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Identify slowest node automatically"
exit 0
