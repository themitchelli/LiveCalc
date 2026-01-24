#!/bin/bash
# Test: verify separate debug build with source maps for development
# AC: Separate debug build with source maps for development

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
CMAKE_FILE="$PROJECT_ROOT/livecalc-engine/CMakeLists.txt"
DEBUG_BUILD_DIR="$PROJECT_ROOT/livecalc-engine/build-wasm-debug"

# Check CMakeLists.txt has debug build configuration
if ! grep -q "WASM Debug build" "$CMAKE_FILE"; then
    echo "FAIL: Debug build configuration not found"
    echo "Expected: WASM Debug build section in CMakeLists.txt"
    echo "Actual: not found"
    exit 1
fi

# Check for source map flags in debug configuration
if ! grep -q '"-gsource-map"' "$CMAKE_FILE"; then
    echo "FAIL: Source map flag not found in debug build"
    echo "Expected: -gsource-map flag in debug configuration"
    echo "Actual: not found"
    exit 1
fi

# Check for debug symbol flag
if ! grep -A10 "WASM Debug build" "$CMAKE_FILE" | grep -q '"-g"'; then
    echo "FAIL: Debug symbol flag -g not found in debug build"
    echo "Expected: -g flag in debug configuration"
    echo "Actual: not found"
    exit 1
fi

# Check debug build directory exists (if build was run)
if [[ -d "$DEBUG_BUILD_DIR" ]]; then
    # Verify debug WASM exists
    if [[ ! -f "$DEBUG_BUILD_DIR/livecalc.wasm" ]]; then
        echo "WARN: Debug build directory exists but livecalc.wasm not found"
    else
        echo "PASS: Debug build with source maps configured and built"
        exit 0
    fi
fi

echo "PASS: Debug build with source maps configured in CMakeLists.txt"
exit 0
