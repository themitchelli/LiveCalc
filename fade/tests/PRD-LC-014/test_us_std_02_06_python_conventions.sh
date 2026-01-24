#!/bin/bash
# Test: verify coding.md documents Python naming conventions
# AC: Python: PEP 8 snake_case throughout

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    exit 1
fi

# Check for Python section
if ! grep -qi "Python" "$CODING_FILE"; then
    echo "FAIL: Python conventions not documented"
    echo "Expected: Python naming conventions"
    echo "Actual: Python not mentioned"
    exit 1
fi

# Check for snake_case reference for Python
if ! grep -qi "snake_case" "$CODING_FILE"; then
    echo "FAIL: snake_case convention for Python not documented"
    echo "Expected: PEP 8 snake_case"
    echo "Actual: snake_case not mentioned"
    exit 1
fi

echo "PASS: Python conventions documented (PEP 8 snake_case)"
exit 0
