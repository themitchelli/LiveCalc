#!/bin/bash
# Test: verify testing.md documents test pyramid
# AC: Test pyramid documented: 'Many unit tests (70%), some integration tests (25%), few E2E tests (5%)'

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for test pyramid mention
if ! grep -qi "pyramid\|unit.*test\|integration.*test\|E2E\|end-to-end" "$TESTING_FILE"; then
    echo "FAIL: Test pyramid not documented"
    echo "Expected: Test pyramid with unit, integration, E2E"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Test pyramid documented"
exit 0
