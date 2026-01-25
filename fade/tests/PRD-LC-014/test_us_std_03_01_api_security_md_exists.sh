#!/bin/bash
# Test: verify standards/api-security.md exists
# AC: standards/api-security.md created

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    echo "Expected: $API_SECURITY_FILE to exist"
    echo "Actual: File not found"
    exit 1
fi

# Check file has content
if [[ ! -s "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md is empty"
    echo "Expected: File with content"
    echo "Actual: Empty file"
    exit 1
fi

echo "PASS: standards/api-security.md exists"
exit 0
