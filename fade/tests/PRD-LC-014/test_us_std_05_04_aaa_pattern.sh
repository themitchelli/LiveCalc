#!/bin/bash
# Test: verify testing.md documents AAA pattern
# AC: AAA pattern: Arrange, Act, Assert

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for AAA pattern mention
if ! grep -qi "AAA\|Arrange.*Act.*Assert" "$TESTING_FILE"; then
    echo "FAIL: AAA pattern not documented"
    echo "Expected: Arrange, Act, Assert pattern"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: AAA pattern documented"
exit 0
