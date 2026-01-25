#!/bin/bash
# Test: verify infrastructure.md documents Terraform requirements
# AC: Use Terraform for all Azure infrastructure, State stored in Azure Storage with locking

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for Terraform mention
if ! grep -qi "Terraform" "$INFRA_FILE"; then
    echo "FAIL: Terraform not documented"
    echo "Expected: Terraform requirements"
    echo "Actual: Not found"
    exit 1
fi

# Check for state management mention
if ! grep -qi "state\|Azure Storage" "$INFRA_FILE"; then
    echo "FAIL: State management not documented"
    echo "Expected: State stored in Azure Storage"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Terraform requirements documented"
exit 0
