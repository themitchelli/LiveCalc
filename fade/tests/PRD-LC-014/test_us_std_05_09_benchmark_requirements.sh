#!/bin/bash
# Test: verify testing.md documents benchmark requirements
# AC: All performance-sensitive PRDs include benchmark targets in Definition of Done

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for benchmark requirements mention
if ! grep -qi "benchmark\|performance" "$TESTING_FILE"; then
    echo "FAIL: Benchmark requirements not documented"
    echo "Expected: Performance benchmark requirements"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Benchmark requirements documented"
exit 0
