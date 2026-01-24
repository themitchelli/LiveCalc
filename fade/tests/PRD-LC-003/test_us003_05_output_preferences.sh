#!/bin/bash
# Test: US-003 AC-05 - Config specifies output preferences (percentiles, show distribution)
# AC: Config specifies output preferences (percentiles, show distribution)

SCHEMA_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/schemas/livecalc.config.schema.json"

# Check for output property
if ! grep -q '"output"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing output property"
    echo "Expected: output property defined"
    echo "Actual: not found"
    exit 1
fi

# Check for percentiles
if ! grep -q '"percentiles"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing percentiles in output"
    echo "Expected: percentiles property"
    echo "Actual: not found"
    exit 1
fi

# Check for showDistribution
if ! grep -q '"showDistribution"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing showDistribution in output"
    echo "Expected: showDistribution property"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Config schema has output preferences (percentiles, showDistribution)"
exit 0
