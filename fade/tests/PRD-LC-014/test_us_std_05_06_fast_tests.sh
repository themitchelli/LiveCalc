#!/bin/bash
# Test: verify testing.md documents fast unit tests
# AC: Fast: unit tests complete in <100ms each

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for fast test requirement
if ! grep -qi "100ms\|fast\|< 100" "$TESTING_FILE"; then
    echo "FAIL: Fast test requirement not documented"
    echo "Expected: Unit tests < 100ms"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Fast unit test requirement documented"
exit 0
