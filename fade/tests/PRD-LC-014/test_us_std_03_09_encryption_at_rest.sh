#!/bin/bash
# Test: verify api-security.md documents encryption at rest
# AC: Encryption at rest for blob storage

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for encryption at rest mention
if ! grep -qi "encryption at rest\|encryption.*rest\|at rest" "$API_SECURITY_FILE"; then
    echo "FAIL: Encryption at rest not documented"
    echo "Expected: Encryption at rest requirement"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Encryption at rest documented"
exit 0
