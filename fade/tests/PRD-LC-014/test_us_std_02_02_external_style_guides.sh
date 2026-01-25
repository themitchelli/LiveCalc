#!/bin/bash
# Test: verify coding.md references external style guides
# AC: References external style guides: Google TypeScript Guide, PEP 8, C++ Core Guidelines

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    exit 1
fi

# Check for Google TypeScript Style Guide
if ! grep -qi "Google.*TypeScript\|google.github.io/styleguide/tsguide" "$CODING_FILE"; then
    echo "FAIL: Google TypeScript Style Guide not referenced"
    echo "Expected: Reference to Google TypeScript Style Guide"
    echo "Actual: Not found"
    exit 1
fi

# Check for PEP 8
if ! grep -qi "PEP 8\|PEP8\|peps.python.org" "$CODING_FILE"; then
    echo "FAIL: PEP 8 not referenced"
    echo "Expected: Reference to PEP 8"
    echo "Actual: Not found"
    exit 1
fi

# Check for C++ Core Guidelines
if ! grep -qi "C++ Core Guidelines\|CppCoreGuidelines\|isocpp.github.io" "$CODING_FILE"; then
    echo "FAIL: C++ Core Guidelines not referenced"
    echo "Expected: Reference to C++ Core Guidelines"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: External style guides referenced (Google TS, PEP 8, C++ Core Guidelines)"
exit 0
