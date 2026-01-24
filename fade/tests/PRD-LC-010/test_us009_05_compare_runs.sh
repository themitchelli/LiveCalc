#!/bin/bash
# Test: verify timing comparison across runs
# AC: Compare timing across runs (before/after optimization)

TIMING_PROFILER_FILE="livecalc-vscode/src/pipeline/timing-profiler.ts"

# Assert - Check for compareRuns method
if ! grep -q 'compareRuns' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No compareRuns method"
    echo "Expected: compareRuns for run comparison"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for TimingComparison interface
if ! grep -q 'TimingComparison' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No TimingComparison interface"
    echo "Expected: TimingComparison for delta tracking"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for history storage
if ! grep -q 'history:.*PipelineTimingSummary\[\]\|_history\|getHistory' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No timing history storage"
    echo "Expected: History for cross-run comparison"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for delta calculation
if ! grep -q 'deltaMs\|totalTimeDeltaMs' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No delta calculation"
    echo "Expected: Delta fields for comparison"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for slowerNodes/fasterNodes
if ! grep -q 'slowerNodes\|fasterNodes' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No slower/faster node tracking"
    echo "Expected: slowerNodes and fasterNodes arrays"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Compare timing across runs"
exit 0
