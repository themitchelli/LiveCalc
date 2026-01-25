#!/bin/bash
# Test: verify api-security.md documents quota enforcement
# AC: Quota enforcement: prevent resource exhaustion

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for quota mention
if ! grep -qi "quota" "$API_SECURITY_FILE"; then
    echo "FAIL: Quota enforcement not documented"
    echo "Expected: Quota enforcement requirement"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Quota enforcement documented"
exit 0
