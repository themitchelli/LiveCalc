#!/bin/bash
# Test: verify api-security.md documents SAS token scoping
# AC: Resource scoping: SAS tokens limited to tenant prefix

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for SAS token mention
if ! grep -qi "SAS\|resource.*scoping\|blob.*sas" "$API_SECURITY_FILE"; then
    echo "FAIL: SAS token scoping not documented"
    echo "Expected: SAS token scoping to tenant prefix"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: SAS token scoping documented"
exit 0
