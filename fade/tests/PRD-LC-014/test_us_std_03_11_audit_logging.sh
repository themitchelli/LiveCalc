#!/bin/bash
# Test: verify api-security.md documents audit logging
# AC: Audit logging for all tenant actions

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for audit logging mention
if ! grep -qi "audit.*log\|audit" "$API_SECURITY_FILE"; then
    echo "FAIL: Audit logging not documented"
    echo "Expected: Audit logging for tenant actions"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Audit logging documented"
exit 0
