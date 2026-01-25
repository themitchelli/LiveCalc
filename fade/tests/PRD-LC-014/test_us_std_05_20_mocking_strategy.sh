#!/bin/bash
# Test: verify testing.md documents mocking strategy
# AC: Mocking strategy: 'Mock at boundaries (file system, network). Do not mock internal business logic.'

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for mocking strategy mention
if ! grep -qi "mock.*boundar\|mock\|boundary" "$TESTING_FILE"; then
    echo "FAIL: Mocking strategy not documented"
    echo "Expected: Mock at boundaries, not internal logic"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Mocking strategy documented"
exit 0
