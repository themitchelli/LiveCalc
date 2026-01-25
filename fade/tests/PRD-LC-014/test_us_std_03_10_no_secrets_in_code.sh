#!/bin/bash
# Test: verify api-security.md documents secrets management
# AC: No secrets in code/config (use Azure Key Vault)

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for secrets management mention
if ! grep -qi "secret\|Key Vault" "$API_SECURITY_FILE"; then
    echo "FAIL: Secrets management not documented"
    echo "Expected: No secrets in code, use Key Vault"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Secrets management documented (Key Vault)"
exit 0
