#!/bin/bash
# Test: verify coding.md documents SIMD alignment requirement
# AC: SIMD alignment requirement documented: 'All SharedArrayBuffer allocations must be 16-byte aligned (not 8-byte) for SIMD compatibility. Use alignas(16) in C++.'

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    exit 1
fi

# Check for 16-byte alignment mention
if ! grep -qi "16-byte\|16 byte\|alignas(16)" "$CODING_FILE"; then
    echo "FAIL: 16-byte alignment requirement not documented"
    echo "Expected: 16-byte alignment for SIMD"
    echo "Actual: Not found"
    exit 1
fi

# Check for SIMD mention
if ! grep -qi "SIMD" "$CODING_FILE"; then
    echo "FAIL: SIMD compatibility not mentioned"
    echo "Expected: SIMD compatibility requirement"
    echo "Actual: SIMD not found"
    exit 1
fi

# Check for SharedArrayBuffer mention
if ! grep -qi "SharedArrayBuffer\|SAB" "$CODING_FILE"; then
    echo "FAIL: SharedArrayBuffer not mentioned in alignment context"
    echo "Expected: SharedArrayBuffer alignment requirement"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: SIMD 16-byte alignment requirement documented"
exit 0
