#!/bin/bash
# Test: verify standards/testing.md exists
# AC: standards/testing.md created

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    echo "Expected: $TESTING_FILE to exist"
    echo "Actual: File not found"
    exit 1
fi

# Check file has content
if [[ ! -s "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md is empty"
    echo "Expected: File with content"
    echo "Actual: Empty file"
    exit 1
fi

echo "PASS: standards/testing.md exists"
exit 0
