#!/bin/bash
# Test: verify testing.md documents test organization
# AC: Unit tests: same directory, Integration tests: tests/integration/, E2E tests: tests/e2e/, Benchmark tests: tests/benchmarks/

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for test organization mention
if ! grep -qi "integration/\|e2e/\|benchmark" "$TESTING_FILE"; then
    echo "FAIL: Test organization not documented"
    echo "Expected: tests/integration/, tests/e2e/, tests/benchmarks/"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Test organization documented"
exit 0
