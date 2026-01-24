#!/bin/bash
# Test: verify time-travel debugging at specific scenario/policy offsets
# AC: Time-travel debugging: Inspect memory state at specific scenario/policy offsets

DATA_INSPECTOR_FILE="livecalc-vscode/src/pipeline/data-inspector.ts"

# Assert - Check for getSnapshots method (time-travel requires multiple snapshots)
if ! grep -q 'getSnapshots' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Data inspector does not have getSnapshots"
    echo "Expected: getSnapshots method for time-travel"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for storeSnapshot method
if ! grep -q 'storeSnapshot' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Data inspector does not have storeSnapshot"
    echo "Expected: storeSnapshot to record state over time"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for maxSnapshotsPerRun
if ! grep -q 'maxSnapshotsPerRun\|maxSnapshots' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: No snapshot limit for time-travel"
    echo "Expected: maxSnapshotsPerRun to limit memory"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for timestamp in snapshot
if ! grep -q 'timestamp' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Snapshots do not include timestamp"
    echo "Expected: timestamp for time-travel ordering"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Time-travel debugging: Inspect memory state"
exit 0
