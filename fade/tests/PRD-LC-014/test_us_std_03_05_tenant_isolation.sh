#!/bin/bash
# Test: verify api-security.md documents tenant isolation
# AC: Tenant isolation: users can only access their own data

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for tenant isolation mention
if ! grep -qi "tenant.*isolation\|tenant_id" "$API_SECURITY_FILE"; then
    echo "FAIL: Tenant isolation not documented"
    echo "Expected: Tenant isolation requirement"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Tenant isolation documented"
exit 0
