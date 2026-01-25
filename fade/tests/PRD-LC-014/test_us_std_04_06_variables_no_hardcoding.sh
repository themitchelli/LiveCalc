#!/bin/bash
# Test: verify infrastructure.md documents variables usage
# AC: Variables for environment-specific values (no hardcoding)

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for variables mention
if ! grep -qi "variable\|hardcod" "$INFRA_FILE"; then
    echo "FAIL: Variables usage not documented"
    echo "Expected: Variables for environment values, no hardcoding"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Variables for environment values documented"
exit 0
