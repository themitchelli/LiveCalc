#!/bin/bash
# Test: verify testing.md documents excluding generated code from coverage
# AC: Exclude generated code (WASM bindings, Protobuf) from coverage

TESTING_FILE="./standards/testing.md"

# Check file exists
if [[ ! -f "$TESTING_FILE" ]]; then
    echo "FAIL: standards/testing.md file not found"
    exit 1
fi

# Check for exclude generated code mention
if ! grep -qi "exclude\|generated\|WASM\|Protobuf" "$TESTING_FILE"; then
    echo "FAIL: Excluding generated code from coverage not documented"
    echo "Expected: Exclude WASM bindings, Protobuf from coverage"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Excluding generated code from coverage documented"
exit 0
