#!/bin/bash
# Test: US-003 AC-03 - Config specifies assumption file paths (mortality, lapse, expenses)
# AC: Config specifies assumption file paths (mortality, lapse, expenses)

SCHEMA_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/schemas/livecalc.config.schema.json"

# Check for assumptions property
if ! grep -q '"assumptions"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing assumptions property"
    echo "Expected: assumptions property defined"
    echo "Actual: not found"
    exit 1
fi

# Check for mortality
if ! grep -q '"mortality"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing mortality assumption"
    echo "Expected: mortality in assumptions"
    echo "Actual: not found"
    exit 1
fi

# Check for lapse
if ! grep -q '"lapse"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing lapse assumption"
    echo "Expected: lapse in assumptions"
    echo "Actual: not found"
    exit 1
fi

# Check for expenses
if ! grep -q '"expenses"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing expenses assumption"
    echo "Expected: expenses in assumptions"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Config schema has mortality, lapse, and expenses assumptions"
exit 0
