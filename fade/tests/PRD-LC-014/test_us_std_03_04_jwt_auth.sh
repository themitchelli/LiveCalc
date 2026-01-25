#!/bin/bash
# Test: verify api-security.md documents JWT authentication requirements
# AC: JWT Bearer tokens for cloud API, Token validation against Assumptions Manager JWKS endpoint, Short-lived tokens (1 hour max), Refresh token rotation

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for JWT mention
if ! grep -qi "JWT\|Bearer" "$API_SECURITY_FILE"; then
    echo "FAIL: JWT Bearer tokens not documented"
    echo "Expected: JWT authentication"
    echo "Actual: Not found"
    exit 1
fi

# Check for JWKS mention
if ! grep -qi "JWKS\|JWK" "$API_SECURITY_FILE"; then
    echo "FAIL: JWKS endpoint validation not documented"
    echo "Expected: JWKS endpoint reference"
    echo "Actual: Not found"
    exit 1
fi

# Check for short-lived tokens (1 hour)
if ! grep -qi "1 hour\|short-lived\|expir" "$API_SECURITY_FILE"; then
    echo "FAIL: Short-lived token requirement not documented"
    echo "Expected: 1 hour max token lifetime"
    echo "Actual: Not found"
    exit 1
fi

# Check for refresh token mention
if ! grep -qi "refresh token\|refresh.*rotation" "$API_SECURITY_FILE"; then
    echo "FAIL: Refresh token rotation not documented"
    echo "Expected: Refresh token rotation"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: JWT authentication documented (Bearer, JWKS, 1 hour, refresh rotation)"
exit 0
