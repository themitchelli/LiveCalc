#!/bin/bash
# Test: verify FADE.md Tech Stack section lists required technologies
# AC: Tech Stack section lists: C++ (engine), TypeScript (extension), Python (cloud API), WASM (Emscripten)

FADE_FILE="./FADE.md"

# Check file exists
if [[ ! -f "$FADE_FILE" ]]; then
    echo "FAIL: FADE.md file not found"
    exit 1
fi

# Check for Tech Stack section or mention
if ! grep -qi "Tech Stack" "$FADE_FILE"; then
    echo "FAIL: Tech Stack section not found in FADE.md"
    echo "Expected: Tech Stack section"
    echo "Actual: Not found"
    exit 1
fi

# Check for C++ mention
if ! grep -q "C++" "$FADE_FILE"; then
    echo "FAIL: C++ not mentioned in Tech Stack"
    echo "Expected: C++ (engine)"
    echo "Actual: C++ not found"
    exit 1
fi

# Check for TypeScript mention
if ! grep -qi "TypeScript" "$FADE_FILE"; then
    echo "FAIL: TypeScript not mentioned in Tech Stack"
    echo "Expected: TypeScript (extension)"
    echo "Actual: TypeScript not found"
    exit 1
fi

# Check for Python mention
if ! grep -qi "Python" "$FADE_FILE"; then
    echo "FAIL: Python not mentioned in Tech Stack"
    echo "Expected: Python (cloud API)"
    echo "Actual: Python not found"
    exit 1
fi

# Check for Emscripten mention
if ! grep -qi "Emscripten" "$FADE_FILE"; then
    echo "FAIL: Emscripten not mentioned in Tech Stack"
    echo "Expected: WASM (Emscripten)"
    echo "Actual: Emscripten not found"
    exit 1
fi

echo "PASS: Tech Stack lists C++, TypeScript, Python, WASM (Emscripten)"
exit 0
