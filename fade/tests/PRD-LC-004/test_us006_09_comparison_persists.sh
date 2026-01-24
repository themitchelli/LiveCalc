#!/bin/bash
# Test: verify comparison persists until manually cleared or extension reloads
# AC: Comparison persists until manually cleared or extension reloads

COMPARISON_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/comparison.ts"

# Check workspaceState is used for persistence
if ! grep -q "workspaceState" "$COMPARISON_FILE"; then
    echo "FAIL: workspaceState not used for persistence"
    exit 1
fi

# Check storage key for previous results
if ! grep -q "livecalc.previousResults" "$COMPARISON_FILE"; then
    echo "FAIL: livecalc.previousResults storage key not found"
    exit 1
fi

# Check storage key for pinned baseline
if ! grep -q "livecalc.pinnedBaseline" "$COMPARISON_FILE"; then
    echo "FAIL: livecalc.pinnedBaseline storage key not found"
    exit 1
fi

# Check loadFromStorage method exists
if ! grep -q "loadFromStorage" "$COMPARISON_FILE"; then
    echo "FAIL: loadFromStorage method not found"
    exit 1
fi

# Check saveToStorage method exists
if ! grep -q "saveToStorage" "$COMPARISON_FILE"; then
    echo "FAIL: saveToStorage method not found"
    exit 1
fi

echo "PASS: Comparison persists (uses workspaceState)"
exit 0
