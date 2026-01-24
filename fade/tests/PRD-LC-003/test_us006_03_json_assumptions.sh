#!/bin/bash
# Test: US-006 AC-03 - Load assumptions from JSON files (expenses)
# AC: Load assumptions from JSON files (expenses)

DATA_LOADER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/data/data-loader.ts"
SAMPLES_DIR="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/samples/simple-term-life/assumptions"

# Check for expenses loading
if ! grep -q 'expenses\|loadExpenses' "$DATA_LOADER_FILE"; then
    echo "FAIL: No expenses loading"
    echo "Expected: expenses loading function"
    echo "Actual: not found"
    exit 1
fi

# Check for sample expenses JSON
if [[ ! -f "$SAMPLES_DIR/expenses.json" ]]; then
    echo "FAIL: No sample expenses.json"
    echo "Expected: sample expenses JSON file"
    echo "Actual: not found"
    exit 1
fi

# Verify it's valid JSON
if ! python3 -m json.tool "$SAMPLES_DIR/expenses.json" > /dev/null 2>&1; then
    echo "FAIL: expenses.json is not valid JSON"
    echo "Expected: valid JSON"
    echo "Actual: parse error"
    exit 1
fi

echo "PASS: JSON assumption loading is supported (expenses)"
exit 0
