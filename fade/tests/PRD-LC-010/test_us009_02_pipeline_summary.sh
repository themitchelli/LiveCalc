#!/bin/bash
# Test: verify pipeline summary shows total time and time per stage
# AC: Pipeline summary shows total time and time per stage

TIMING_PROFILER_FILE="livecalc-vscode/src/pipeline/timing-profiler.ts"

# Assert - Check for PipelineTimingSummary interface
if ! grep -q 'PipelineTimingSummary' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No PipelineTimingSummary interface"
    echo "Expected: PipelineTimingSummary for overall timing"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for totalTimeMs field
if ! grep -q 'totalTimeMs:.*number' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: Summary does not include totalTimeMs"
    echo "Expected: totalTimeMs for overall duration"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for totalInitTimeMs
if ! grep -q 'totalInitTimeMs' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: Summary does not include totalInitTimeMs"
    echo "Expected: totalInitTimeMs for aggregated init"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for totalExecuteTimeMs
if ! grep -q 'totalExecuteTimeMs' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: Summary does not include totalExecuteTimeMs"
    echo "Expected: totalExecuteTimeMs for aggregated execution"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for completeRun method
if ! grep -q 'completeRun' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No completeRun method"
    echo "Expected: completeRun to generate summary"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Pipeline summary shows total time and time per stage"
exit 0
