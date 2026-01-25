#!/bin/bash
# Test: verify infrastructure.md documents automated testing before deployment
# AC: Automated testing before deployment (linting, unit tests, integration tests)

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for automated testing mention
if ! grep -qi "test\|lint" "$INFRA_FILE"; then
    echo "FAIL: Automated testing before deployment not documented"
    echo "Expected: Testing before deployment"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Automated testing before deployment documented"
exit 0
