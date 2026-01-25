#!/bin/bash
# Test: verify standards/infrastructure.md exists
# AC: standards/infrastructure.md created

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    echo "Expected: $INFRA_FILE to exist"
    echo "Actual: File not found"
    exit 1
fi

# Check file has content
if [[ ! -s "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md is empty"
    echo "Expected: File with content"
    echo "Actual: Empty file"
    exit 1
fi

echo "PASS: standards/infrastructure.md exists"
exit 0
