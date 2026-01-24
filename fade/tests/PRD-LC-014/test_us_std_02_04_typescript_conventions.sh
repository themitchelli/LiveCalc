#!/bin/bash
# Test: verify coding.md documents TypeScript naming conventions
# AC: TypeScript: camelCase for functions/variables, PascalCase for classes, UPPER_CASE for constants

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    exit 1
fi

# Check for TypeScript section
if ! grep -qi "TypeScript" "$CODING_FILE"; then
    echo "FAIL: TypeScript conventions not documented"
    echo "Expected: TypeScript naming conventions"
    echo "Actual: TypeScript not mentioned"
    exit 1
fi

# Check for camelCase
if ! grep -qi "camelCase" "$CODING_FILE"; then
    echo "FAIL: camelCase convention not documented"
    echo "Expected: camelCase for functions/variables"
    echo "Actual: camelCase not mentioned"
    exit 1
fi

# Check for PascalCase
if ! grep -qi "PascalCase" "$CODING_FILE"; then
    echo "FAIL: PascalCase convention not documented"
    echo "Expected: PascalCase for classes"
    echo "Actual: PascalCase not mentioned"
    exit 1
fi

# Check for UPPER_CASE/UPPER_SNAKE_CASE for constants
if ! grep -qi "UPPER_CASE\|UPPER_SNAKE_CASE\|UPPER CASE" "$CODING_FILE"; then
    echo "FAIL: UPPER_CASE convention for constants not documented"
    echo "Expected: UPPER_CASE for constants"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: TypeScript conventions documented (camelCase, PascalCase, UPPER_CASE)"
exit 0
