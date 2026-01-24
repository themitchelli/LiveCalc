#!/bin/bash
# Test: verify waterfall view of pipeline execution
# AC: Waterfall view of pipeline execution showing parallel/sequential

TIMING_PROFILER_FILE="livecalc-vscode/src/pipeline/timing-profiler.ts"

# Assert - Check for WaterfallData interface
if ! grep -q 'WaterfallData' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No WaterfallData interface"
    echo "Expected: WaterfallData for visualization"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for generateWaterfallData method
if ! grep -q 'generateWaterfallData' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No generateWaterfallData method"
    echo "Expected: generateWaterfallData for chart data"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for hasParallelExecution flag
if ! grep -q 'hasParallelExecution' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No hasParallelExecution flag"
    echo "Expected: hasParallelExecution to detect parallel"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for bars with stage information
if ! grep -q "stage:.*'wait'\|'init'\|'execute'\|'handoff'" "$TIMING_PROFILER_FILE"; then
    echo "FAIL: Waterfall bars do not include stage"
    echo "Expected: Stage info for each bar"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Waterfall view of pipeline execution"
exit 0
