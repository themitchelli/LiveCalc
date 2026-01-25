#!/bin/bash
# Test: verify api-security.md documents error handling security
# AC: Error handling: 'Never expose stack traces or internal paths in API responses. Log detailed errors server-side, return generic messages to clients.'

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for error handling security mention
if ! grep -qi "stack trace\|internal.*path\|expose\|error.*handl" "$API_SECURITY_FILE"; then
    echo "FAIL: Error handling security not documented"
    echo "Expected: Don't expose stack traces or internal paths"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Error handling security documented"
exit 0
