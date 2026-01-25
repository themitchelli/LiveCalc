#!/bin/bash
# Test: verify testing.md documents descriptive test names
# AC: Descriptive names: test_scenario_expectedBehavior or 'should do X when Y'

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for descriptive names mention
if ! grep -qi "descriptive\|should.*when\|test_.*_" "$TESTING_FILE"; then
    echo "FAIL: Descriptive test names not documented"
    echo "Expected: Guidance on descriptive test names"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Descriptive test names documented"
exit 0
