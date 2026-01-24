#!/bin/bash
# Test: verify coding.md documents error handling patterns
# AC: Error handling: 'Throw exceptions with descriptive messages in C++/TypeScript. Return error codes in hot-path WASM functions for performance.'

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    exit 1
fi

# Check for error handling section
if ! grep -qi "error handling\|exception\|throw" "$CODING_FILE"; then
    echo "FAIL: Error handling not documented"
    echo "Expected: Error handling guidance"
    echo "Actual: Not found"
    exit 1
fi

# Check for hot path performance mention
if ! grep -qi "hot.*path\|performance\|error code" "$CODING_FILE"; then
    echo "FAIL: Hot path error handling not documented"
    echo "Expected: Error codes for hot-path WASM functions"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Error handling documented (exceptions for normal, error codes for hot-path)"
exit 0
