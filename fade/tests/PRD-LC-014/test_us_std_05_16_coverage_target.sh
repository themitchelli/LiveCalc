#!/bin/bash
# Test: verify testing.md documents coverage target
# AC: Target: 80% line coverage for new code

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for coverage target mention
if ! grep -qi "80%\|coverage" "$TESTING_FILE"; then
    echo "FAIL: Coverage target not documented"
    echo "Expected: 80% line coverage target"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Coverage target documented"
exit 0
