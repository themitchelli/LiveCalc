#!/bin/bash
# Test: verify data table view with pagination for large arrays
# AC: Data table view with pagination for large arrays

DATA_INSPECTOR_FILE="livecalc-vscode/src/pipeline/data-inspector.ts"

# Assert - Check for getDataSlice method
if ! grep -q 'getDataSlice' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Data inspector does not have getDataSlice"
    echo "Expected: getDataSlice method for pagination"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for offset parameter
if ! grep -q 'offset:.*number\|offset,' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: getDataSlice does not have offset parameter"
    echo "Expected: offset parameter for pagination"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for limit parameter
if ! grep -q 'limit:.*number\|limit,' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: getDataSlice does not have limit parameter"
    echo "Expected: limit parameter for pagination"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Data table view with pagination for large arrays"
exit 0
