#!/bin/bash
# Test: verify CMakeLists.txt supports -msimd128 flag as build option
# AC: CMakeLists.txt supports -msimd128 flag as build option

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

CMAKE_FILE="$PROJECT_ROOT/livecalc-engine/CMakeLists.txt"

if [[ ! -f "$CMAKE_FILE" ]]; then
    echo "FAIL: CMakeLists.txt not found"
    echo "Expected: $CMAKE_FILE"
    exit 1
fi

# Check for ENABLE_SIMD option
if ! grep -q "option.*ENABLE_SIMD" "$CMAKE_FILE"; then
    echo "FAIL: ENABLE_SIMD option not found in CMakeLists.txt"
    echo "Expected: option(ENABLE_SIMD ...)"
    exit 1
fi

# Check for -msimd128 flag
if ! grep -q "msimd128\|-msimd128" "$CMAKE_FILE"; then
    echo "FAIL: -msimd128 flag not found in CMakeLists.txt"
    echo "Expected: -msimd128 compile/link flag"
    exit 1
fi

echo "PASS: CMakeLists.txt supports ENABLE_SIMD option with -msimd128 flag"
exit 0
