#!/bin/bash
# Test: verify build optimized with -O3 and -flto flags
# AC: Build optimized with -O3 and -flto flags

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
CMAKE_FILE="$PROJECT_ROOT/livecalc-engine/CMakeLists.txt"

# Check for -O3 optimization in release build
if ! grep -q '"-O3"' "$CMAKE_FILE"; then
    echo "FAIL: -O3 optimization flag not found in CMakeLists.txt"
    echo "Expected: -O3 flag in WASM release build"
    echo "Actual: not found"
    exit 1
fi

# Check for -flto (link time optimization) in release build
if ! grep -q '"-flto"' "$CMAKE_FILE"; then
    echo "FAIL: -flto flag not found in CMakeLists.txt"
    echo "Expected: -flto flag in WASM release build"
    echo "Actual: not found"
    exit 1
fi

# Verify these are in the release build section
if ! grep -A5 "WASM Release build" "$CMAKE_FILE" | grep -q -- "-O3"; then
    echo "FAIL: -O3 not in WASM Release build section"
    echo "Expected: -O3 in release build configuration"
    echo "Actual: not in correct section"
    exit 1
fi

echo "PASS: Build uses -O3 and -flto optimization flags"
exit 0
