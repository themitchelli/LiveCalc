#!/bin/bash
# Test: verify testing.md documents integration test location
# AC: Tests in tests/ directory at project root

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for integration test location mention
if ! grep -qi "tests/\|integration" "$TESTING_FILE"; then
    echo "FAIL: Integration test location not documented"
    echo "Expected: Integration tests in tests/ directory"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Integration test location documented"
exit 0
