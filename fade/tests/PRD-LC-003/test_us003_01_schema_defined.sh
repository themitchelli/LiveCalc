#!/bin/bash
# Test: US-003 AC-01 - livecalc.config.json schema defined and documented
# AC: livecalc.config.json schema defined and documented

SCHEMA_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/schemas/livecalc.config.schema.json"

# Check if schema file exists
if [[ ! -f "$SCHEMA_FILE" ]]; then
    echo "FAIL: Config schema file not found"
    echo "Expected: schemas/livecalc.config.schema.json exists"
    echo "Actual: file not found"
    exit 1
fi

# Check if it's valid JSON
if ! python3 -m json.tool "$SCHEMA_FILE" > /dev/null 2>&1; then
    echo "FAIL: Schema file is not valid JSON"
    echo "Expected: valid JSON schema"
    echo "Actual: JSON parse error"
    exit 1
fi

# Check for $schema property (indicates proper JSON schema)
if ! grep -q '"\$schema"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema file missing \$schema property"
    echo "Expected: \$schema property"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Config schema is defined and valid JSON"
exit 0
