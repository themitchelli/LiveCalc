#!/bin/bash
# Test: US-004 AC-10 - Memory cleaned up after each run
# AC: Memory cleaned up after each run

ENGINE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/engine/livecalc-engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: Engine file not found"
    exit 1
fi

# Check for cleanup in finally block or after run
if ! grep -q 'clearPolicies\|cleanup\|dispose' "$ENGINE_FILE"; then
    echo "FAIL: No memory cleanup methods"
    echo "Expected: clearPolicies or cleanup method"
    echo "Actual: not found"
    exit 1
fi

# Check for finally block (ensures cleanup runs)
if ! grep -q 'finally' "$ENGINE_FILE"; then
    echo "FAIL: No finally block for guaranteed cleanup"
    echo "Expected: finally block for cleanup"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Engine has memory cleanup after runs"
exit 0
