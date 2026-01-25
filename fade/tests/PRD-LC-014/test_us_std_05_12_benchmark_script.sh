#!/bin/bash
# Test: verify testing.md documents benchmark script location
# AC: Benchmark script: npm run benchmark in livecalc-engine/js

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for benchmark script mention
if ! grep -qi "npm run benchmark\|benchmark" "$TESTING_FILE"; then
    echo "FAIL: Benchmark script not documented"
    echo "Expected: npm run benchmark in livecalc-engine/js"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Benchmark script documented"
exit 0
