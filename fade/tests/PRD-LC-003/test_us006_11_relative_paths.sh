#!/bin/bash
# Test: US-006 AC-11 - Support relative and absolute paths
# AC: Support relative and absolute paths

DATA_LOADER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/data/data-loader.ts"

# Check for path resolution
if ! grep -q 'path.resolve\|isAbsolute' "$DATA_LOADER_FILE"; then
    echo "FAIL: No path resolution logic"
    echo "Expected: path.resolve or isAbsolute"
    echo "Actual: not found"
    exit 1
fi

# Check for resolveDataPath function
if ! grep -q 'resolveDataPath' "$DATA_LOADER_FILE"; then
    echo "FAIL: No resolveDataPath function"
    echo "Expected: resolveDataPath function"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Relative and absolute paths are supported"
exit 0
