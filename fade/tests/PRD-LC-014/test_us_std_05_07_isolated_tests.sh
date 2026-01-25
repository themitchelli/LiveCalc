#!/bin/bash
# Test: verify testing.md documents test isolation
# AC: Isolated: no shared state, no external dependencies

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for isolation mention
if ! grep -qi "isolated\|shared state\|no external" "$TESTING_FILE"; then
    echo "FAIL: Test isolation not documented"
    echo "Expected: No shared state between tests"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Test isolation documented"
exit 0
