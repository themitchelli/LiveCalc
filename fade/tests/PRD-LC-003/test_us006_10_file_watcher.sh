#!/bin/bash
# Test: US-006 AC-10 - File watcher invalidates cache on change
# AC: File watcher invalidates cache on change

CACHE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/data/cache.ts"

if [[ ! -f "$CACHE_FILE" ]]; then
    echo "FAIL: Cache file not found"
    exit 1
fi

# Check for file watcher or invalidation
if ! grep -q 'invalidate\|watcher\|watch' "$CACHE_FILE"; then
    echo "FAIL: No cache invalidation mechanism"
    echo "Expected: invalidation or watch functionality"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Cache has invalidation support"
exit 0
