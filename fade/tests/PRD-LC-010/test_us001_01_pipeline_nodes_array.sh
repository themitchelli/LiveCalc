#!/bin/bash
# Test: verify config schema supports optional 'pipeline.nodes' array
# AC: Config schema supports optional 'pipeline.nodes' array

SCHEMA_FILE="livecalc-vscode/schemas/livecalc.config.schema.json"

# Assert - Check that schema file exists
if [[ ! -f "$SCHEMA_FILE" ]]; then
    echo "FAIL: Schema file does not exist at $SCHEMA_FILE"
    echo "Expected: $SCHEMA_FILE exists"
    echo "Actual: File not found"
    exit 1
fi

# Assert - Check that pipeline.nodes is defined in schema
if ! grep -q '"pipeline"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema does not contain 'pipeline' property"
    echo "Expected: 'pipeline' property in schema"
    echo "Actual: Not found"
    exit 1
fi

if ! grep -q '"nodes"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema does not contain 'nodes' property"
    echo "Expected: 'nodes' property within pipeline"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Verify nodes is an array type
if ! grep -A 2 '"nodes"' "$SCHEMA_FILE" | grep -q '"type": "array"'; then
    echo "FAIL: 'nodes' property is not typed as array"
    echo "Expected: 'nodes' to have type 'array'"
    echo "Actual: Different type or not specified"
    exit 1
fi

echo "PASS: Config schema supports optional 'pipeline.nodes' array"
exit 0
