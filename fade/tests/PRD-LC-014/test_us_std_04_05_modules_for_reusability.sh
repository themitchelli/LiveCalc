#!/bin/bash
# Test: verify infrastructure.md documents module usage
# AC: Modules for reusable components (AKS cluster, storage account)

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for modules mention
if ! grep -qi "module" "$INFRA_FILE"; then
    echo "FAIL: Modules for reusability not documented"
    echo "Expected: Module usage for reusable components"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Terraform modules documented"
exit 0
