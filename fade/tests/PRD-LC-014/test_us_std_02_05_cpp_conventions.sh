#!/bin/bash
# Test: verify coding.md documents C++ naming conventions
# AC: C++: snake_case for functions/variables (matches actuarial convention), PascalCase for classes

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    exit 1
fi

# Check for C++ section
if ! grep -q "C++" "$CODING_FILE"; then
    echo "FAIL: C++ conventions not documented"
    echo "Expected: C++ naming conventions"
    echo "Actual: C++ not mentioned"
    exit 1
fi

# Check for snake_case
if ! grep -qi "snake_case" "$CODING_FILE"; then
    echo "FAIL: snake_case convention for C++ not documented"
    echo "Expected: snake_case for functions/variables"
    echo "Actual: snake_case not mentioned"
    exit 1
fi

echo "PASS: C++ conventions documented (snake_case, PascalCase)"
exit 0
