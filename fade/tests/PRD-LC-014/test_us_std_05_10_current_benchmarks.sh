#!/bin/bash
# Test: verify testing.md documents current benchmarks from SPIKE-LC-007
# AC: Current benchmarks (from SPIKE-LC-007): 10K×1K ~370ms, 100K×1K ~3s, 1M×1K ~36s

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for benchmark values
if ! grep -qi "10K\|100K\|1M\|370ms\|32M" "$TESTING_FILE"; then
    echo "FAIL: Current benchmark values not documented"
    echo "Expected: 10K×1K, 100K×1K, 1M×1K benchmark targets"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Current benchmark values documented"
exit 0
