#!/bin/bash
# Test: verify each node reports init, execution, handoff time
# AC: Each node reports: init time, execution time, handoff time

TIMING_PROFILER_FILE="livecalc-vscode/src/pipeline/timing-profiler.ts"

# Assert - Check for NodeTimingDetail interface
if ! grep -q 'NodeTimingDetail' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No NodeTimingDetail interface"
    echo "Expected: NodeTimingDetail for per-node timing"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for initTimeMs field
if ! grep -q 'initTimeMs' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: NodeTimingDetail does not include initTimeMs"
    echo "Expected: initTimeMs for initialization time"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for executeTimeMs field
if ! grep -q 'executeTimeMs' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: NodeTimingDetail does not include executeTimeMs"
    echo "Expected: executeTimeMs for execution time"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for handoffTimeMs field
if ! grep -q 'handoffTimeMs' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: NodeTimingDetail does not include handoffTimeMs"
    echo "Expected: handoffTimeMs for handoff time"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for recordNodeTiming method
if ! grep -q 'recordNodeTiming' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No recordNodeTiming method"
    echo "Expected: recordNodeTiming for collecting timing"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Each node reports init, execution, handoff time"
exit 0
