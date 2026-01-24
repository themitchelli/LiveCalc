#!/bin/bash
# Test: verify testing.md documents PRD regression protection
# AC: All PRDs must maintain passing tests from previous PRDs

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for PRD regression protection mention
if ! grep -qi "PRD\|regression\|previous" "$TESTING_FILE"; then
    echo "FAIL: PRD regression protection not documented"
    echo "Expected: Maintain passing tests from previous PRDs"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: PRD regression protection documented"
exit 0
