#!/bin/bash
# Test: verify JSON Schema is updated with pipeline definitions
# AC: JSON Schema updated with pipeline definitions and validation

SCHEMA_FILE="livecalc-vscode/schemas/livecalc.config.schema.json"

# Assert - Check schema file exists
if [[ ! -f "$SCHEMA_FILE" ]]; then
    echo "FAIL: Schema file does not exist"
    echo "Expected: $SCHEMA_FILE exists"
    echo "Actual: File not found"
    exit 1
fi

# Assert - Check schema has $schema property (valid JSON Schema)
if ! grep -q '"\$schema"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema file does not have \$schema property"
    echo "Expected: Valid JSON Schema with \$schema property"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check pipeline configuration is documented
if ! grep -q '"description":.*[Pp]ipeline' "$SCHEMA_FILE"; then
    echo "FAIL: Pipeline property lacks description"
    echo "Expected: Pipeline property to have description"
    echo "Actual: No pipeline description found"
    exit 1
fi

# Assert - Check debug configuration is included
if ! grep -q '"debug"' "$SCHEMA_FILE"; then
    echo "FAIL: Debug configuration not in schema"
    echo "Expected: 'debug' property in pipeline schema"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check breakpoints configuration is included
if ! grep -q '"breakpoints"' "$SCHEMA_FILE"; then
    echo "FAIL: Breakpoints configuration not in schema"
    echo "Expected: 'breakpoints' property in debug schema"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check integrity checks configuration is included
if ! grep -q 'enableIntegrityChecks' "$SCHEMA_FILE"; then
    echo "FAIL: Integrity checks configuration not in schema"
    echo "Expected: 'enableIntegrityChecks' property in debug schema"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: JSON Schema updated with pipeline definitions and validation"
exit 0
