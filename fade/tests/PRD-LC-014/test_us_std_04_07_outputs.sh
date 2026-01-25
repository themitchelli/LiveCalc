#!/bin/bash
# Test: verify infrastructure.md documents outputs usage
# AC: Outputs for resource IDs needed by downstream tools

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for outputs mention
if ! grep -qi "output" "$INFRA_FILE"; then
    echo "FAIL: Outputs usage not documented"
    echo "Expected: Outputs for downstream tools"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Terraform outputs documented"
exit 0
