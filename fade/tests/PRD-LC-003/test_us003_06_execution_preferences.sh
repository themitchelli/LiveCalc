#!/bin/bash
# Test: US-003 AC-06 - Config specifies execution preferences (auto-run, timeout)
# AC: Config specifies execution preferences (auto-run, timeout)

SCHEMA_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/schemas/livecalc.config.schema.json"

# Check for execution property
if ! grep -q '"execution"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing execution property"
    echo "Expected: execution property defined"
    echo "Actual: not found"
    exit 1
fi

# Check for autoRunOnSave
if ! grep -q '"autoRunOnSave"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing autoRunOnSave in execution"
    echo "Expected: autoRunOnSave property"
    echo "Actual: not found"
    exit 1
fi

# Check for timeout
if ! grep -q '"timeout"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing timeout in execution"
    echo "Expected: timeout property"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Config schema has execution preferences (autoRunOnSave, timeout)"
exit 0
