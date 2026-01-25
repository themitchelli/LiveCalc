#!/bin/bash
# Test: verify infrastructure.md documents schema validation
# AC: Schema validation for all config files (JSON Schema)

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for schema validation mention
if ! grep -qi "schema\|JSON Schema\|validation" "$INFRA_FILE"; then
    echo "FAIL: Schema validation not documented"
    echo "Expected: JSON Schema validation for config"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Schema validation documented"
exit 0
