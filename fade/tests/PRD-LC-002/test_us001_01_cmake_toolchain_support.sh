#!/bin/bash
# Test: verify CMakeLists.txt supports both native and Emscripten builds via toolchain file
# AC: CMakeLists.txt supports both native and Emscripten builds via toolchain file

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
CMAKE_FILE="$PROJECT_ROOT/livecalc-engine/CMakeLists.txt"

# Assert CMakeLists.txt exists
if [[ ! -f "$CMAKE_FILE" ]]; then
    echo "FAIL: CMakeLists.txt not found"
    echo "Expected: $CMAKE_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for EMSCRIPTEN detection
if ! grep -q "if(EMSCRIPTEN)" "$CMAKE_FILE"; then
    echo "FAIL: CMakeLists.txt does not check for EMSCRIPTEN build"
    echo "Expected: if(EMSCRIPTEN) condition present"
    echo "Actual: condition not found"
    exit 1
fi

# Check for native build path (when not EMSCRIPTEN)
if ! grep -q "Building native executable" "$CMAKE_FILE"; then
    echo "FAIL: CMakeLists.txt does not have native build path"
    echo "Expected: native build configuration message"
    echo "Actual: not found"
    exit 1
fi

# Check for WASM build path
if ! grep -q "Building for WebAssembly with Emscripten" "$CMAKE_FILE"; then
    echo "FAIL: CMakeLists.txt does not have WASM build path"
    echo "Expected: WASM build configuration message"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: CMakeLists.txt supports both native and Emscripten builds"
exit 0
