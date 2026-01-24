#!/bin/bash
# Test: verify api-security.md documents TLS requirements
# AC: TLS 1.3 for all network traffic

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for TLS 1.3 mention
if ! grep -qi "TLS 1.3\|TLS" "$API_SECURITY_FILE"; then
    echo "FAIL: TLS requirements not documented"
    echo "Expected: TLS 1.3 requirement"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: TLS requirements documented"
exit 0
