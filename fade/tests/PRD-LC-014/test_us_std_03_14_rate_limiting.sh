#!/bin/bash
# Test: verify api-security.md documents rate limiting
# AC: Rate limiting: 'Implement per-tenant rate limits to prevent abuse'

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for rate limiting mention
if ! grep -qi "rate limit" "$API_SECURITY_FILE"; then
    echo "FAIL: Rate limiting not documented"
    echo "Expected: Per-tenant rate limits"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Rate limiting documented"
exit 0
