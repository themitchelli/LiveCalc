#!/bin/bash
# Test: verify testing.md documents regression tolerance
# AC: New features must not regress these targets by >10%

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for 10% regression tolerance mention
if ! grep -qi "10%\|regression\|tolerance" "$TESTING_FILE"; then
    echo "FAIL: Regression tolerance not documented"
    echo "Expected: 10% regression tolerance"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Regression tolerance documented"
exit 0
