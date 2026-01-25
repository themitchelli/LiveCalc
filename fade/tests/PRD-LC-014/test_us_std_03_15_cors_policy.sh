#!/bin/bash
# Test: verify api-security.md documents CORS policy
# AC: CORS policy: 'Explicitly allow VS Code extension origin, deny all others'

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for CORS mention
if ! grep -qi "CORS" "$API_SECURITY_FILE"; then
    echo "FAIL: CORS policy not documented"
    echo "Expected: CORS policy with explicit origins"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: CORS policy documented"
exit 0
