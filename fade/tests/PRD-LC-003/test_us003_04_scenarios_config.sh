#!/bin/bash
# Test: US-003 AC-04 - Config specifies scenario settings (count, seed, interest rate parameters)
# AC: Config specifies scenario settings (count, seed, interest rate parameters)

SCHEMA_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/schemas/livecalc.config.schema.json"

# Check for scenarios property
if ! grep -q '"scenarios"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing scenarios property"
    echo "Expected: scenarios property defined"
    echo "Actual: not found"
    exit 1
fi

# Check for count
if ! grep -q '"count"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing count in scenarios"
    echo "Expected: count property"
    echo "Actual: not found"
    exit 1
fi

# Check for seed
if ! grep -q '"seed"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing seed in scenarios"
    echo "Expected: seed property"
    echo "Actual: not found"
    exit 1
fi

# Check for interestRate
if ! grep -q '"interestRate"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing interestRate in scenarios"
    echo "Expected: interestRate property"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Config schema has scenario settings (count, seed, interestRate)"
exit 0
