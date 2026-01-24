#!/bin/bash
# Test: verify testing.md documents merge blocking for failed tests
# AC: Failed regression tests block merge to main

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for merge blocking mention
if ! grep -qi "block.*merge\|merge\|main" "$TESTING_FILE"; then
    echo "FAIL: Merge blocking not documented"
    echo "Expected: Failed tests block merge to main"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Merge blocking for failed tests documented"
exit 0
