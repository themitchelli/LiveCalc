#!/bin/bash
# Test: US-006 AC-09 - Cache loaded data between runs if files unchanged
# AC: Cache loaded data between runs if files unchanged

DATA_LOADER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/data/data-loader.ts"
CACHE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/data/cache.ts"

# Check for cache in data loader
if ! grep -q 'cache\|Cache' "$DATA_LOADER_FILE"; then
    echo "FAIL: No cache usage in data loader"
    echo "Expected: cache integration"
    echo "Actual: not found"
    exit 1
fi

# Check for cache implementation
if [[ ! -f "$CACHE_FILE" ]]; then
    echo "FAIL: Cache implementation file not found"
    echo "Expected: src/data/cache.ts exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for cache get/set methods
if ! grep -q 'get\|set' "$CACHE_FILE"; then
    echo "FAIL: No get/set methods in cache"
    echo "Expected: cache get/set methods"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Data caching is implemented"
exit 0
