#!/bin/bash
# Test: verify api-security.md documents input validation
# AC: Input validation: 'Validate at system boundaries (API endpoints, file uploads). Trust internal interfaces. Fail fast with clear error messages.'

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for input validation mention
if ! grep -qi "input validation\|validate.*boundary\|validation" "$API_SECURITY_FILE"; then
    echo "FAIL: Input validation not documented"
    echo "Expected: Input validation at boundaries"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Input validation documented"
exit 0
