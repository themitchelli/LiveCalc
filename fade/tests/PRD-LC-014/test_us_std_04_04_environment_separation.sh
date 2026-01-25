#!/bin/bash
# Test: verify infrastructure.md documents environment separation
# AC: Separate state files per environment (dev, staging, prod)

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for environment separation mention
if ! grep -qi "dev\|staging\|prod\|environment" "$INFRA_FILE"; then
    echo "FAIL: Environment separation not documented"
    echo "Expected: Separate state per environment (dev, staging, prod)"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Environment separation documented"
exit 0
