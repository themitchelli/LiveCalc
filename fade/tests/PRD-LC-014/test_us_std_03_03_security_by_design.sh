#!/bin/bash
# Test: verify api-security.md documents Security by Design principle
# AC: Security by Design principle: 'Privacy and security are architectural requirements, not afterthoughts...'

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for Security by Design mention
if ! grep -qi "Security by Design\|security.*design\|architectural.*requirement" "$API_SECURITY_FILE"; then
    echo "FAIL: Security by Design principle not documented"
    echo "Expected: Security by Design principle"
    echo "Actual: Not found"
    exit 1
fi

# Check for authentication mention
if ! grep -qi "authentication" "$API_SECURITY_FILE"; then
    echo "FAIL: Authentication not mentioned in security context"
    echo "Expected: Authentication consideration"
    echo "Actual: Not found"
    exit 1
fi

# Check for authorization mention
if ! grep -qi "authorization" "$API_SECURITY_FILE"; then
    echo "FAIL: Authorization not mentioned in security context"
    echo "Expected: Authorization consideration"
    echo "Actual: Not found"
    exit 1
fi

# Check for encryption mention
if ! grep -qi "encryption" "$API_SECURITY_FILE"; then
    echo "FAIL: Encryption not mentioned in security context"
    echo "Expected: Encryption consideration"
    echo "Actual: Not found"
    exit 1
fi

# Check for audit mention
if ! grep -qi "audit" "$API_SECURITY_FILE"; then
    echo "FAIL: Audit logging not mentioned"
    echo "Expected: Audit logging consideration"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Security by Design documented (authentication, authorization, encryption, audit)"
exit 0
