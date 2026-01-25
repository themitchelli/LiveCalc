#!/bin/bash
# Test: verify testing.md documents unit test colocation
# AC: Co-located with source: same directory as *.test.ts or *_test.py

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for co-location mention
if ! grep -qi "co-locat\|same directory\|\.test\.ts\|_test\.py" "$TESTING_FILE"; then
    echo "FAIL: Unit test co-location not documented"
    echo "Expected: Tests co-located with source"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Unit test co-location documented"
exit 0
