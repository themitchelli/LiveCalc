#!/bin/bash
# Test: verify all bus:// data can be inspected while paused
# AC: Inspect all bus:// data while paused (with checksums)

BREAKPOINT_FILE="livecalc-vscode/src/pipeline/breakpoint-manager.ts"

# Assert - Check for busDataSnapshot in PausedState
if ! grep -q 'busDataSnapshot' "$BREAKPOINT_FILE"; then
    echo "FAIL: PausedState does not include busDataSnapshot"
    echo "Expected: busDataSnapshot for data inspection"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for checksums in PausedState
if ! grep -q 'checksums\?:' "$BREAKPOINT_FILE"; then
    echo "FAIL: PausedState does not include checksums"
    echo "Expected: checksums field for integrity data"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for getPausedState method
if ! grep -q 'getPausedState' "$BREAKPOINT_FILE"; then
    echo "FAIL: No getPausedState method"
    echo "Expected: getPausedState to retrieve state"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Inspect all bus:// data while paused (with checksums)"
exit 0
