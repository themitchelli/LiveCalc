#!/bin/bash
# Test: US-004 AC-03 - Engine initializes on extension activation (lazy load)
# AC: Engine initializes on extension activation (lazy load)

ENGINE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/engine/livecalc-engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: Engine file not found"
    echo "Expected: src/engine/livecalc-engine.ts exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for lazy initialization pattern (init promise)
if ! grep -q 'initPromise\|Initializing' "$ENGINE_FILE"; then
    echo "FAIL: No lazy initialization pattern found"
    echo "Expected: lazy init promise pattern"
    echo "Actual: not found"
    exit 1
fi

# Check for async initialize method
if ! grep -q 'async initialize' "$ENGINE_FILE"; then
    echo "FAIL: No async initialize method"
    echo "Expected: async initialize() method"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Engine has lazy initialization pattern"
exit 0
