#!/bin/bash
# Test: verify standards/coding.md exists
# AC: standards/coding.md created

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    echo "Expected: $CODING_FILE to exist"
    echo "Actual: File not found"
    exit 1
fi

# Check file has content
if [[ ! -s "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md is empty"
    echo "Expected: File with content"
    echo "Actual: Empty file"
    exit 1
fi

echo "PASS: standards/coding.md exists"
exit 0
