#!/bin/bash
# Test: verify testing.md documents CI test runs
# AC: Test suite runs on every commit (GitHub Actions)

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for CI test run mention
if ! grep -qi "commit\|GitHub Actions\|CI" "$TESTING_FILE"; then
    echo "FAIL: CI test runs not documented"
    echo "Expected: Test suite runs on every commit"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: CI test runs documented"
exit 0
