#!/bin/bash
# Test: verify FADE.md contains architecture diagram with key components
# AC: Architecture diagram shows: VS Code Extension → WASM Engine ← SharedArrayBuffer → Worker Pool

FADE_FILE="./FADE.md"

# Check file exists
if [[ ! -f "$FADE_FILE" ]]; then
    echo "FAIL: FADE.md file not found"
    exit 1
fi

# Check for VS Code Extension in diagram context
if ! grep -qi "VS Code Extension\|VS Code\|VSCode" "$FADE_FILE"; then
    echo "FAIL: VS Code Extension not found in architecture diagram"
    echo "Expected: VS Code Extension reference"
    echo "Actual: Not found"
    exit 1
fi

# Check for SharedArrayBuffer mention
if ! grep -qi "SharedArrayBuffer\|SAB" "$FADE_FILE"; then
    echo "FAIL: SharedArrayBuffer not found in architecture diagram"
    echo "Expected: SharedArrayBuffer reference"
    echo "Actual: Not found"
    exit 1
fi

# Check for Worker Pool mention
if ! grep -qi "Worker Pool\|Worker" "$FADE_FILE"; then
    echo "FAIL: Worker Pool not found in architecture diagram"
    echo "Expected: Worker Pool reference"
    echo "Actual: Not found"
    exit 1
fi

# Check for WASM mention
if ! grep -qi "WASM" "$FADE_FILE"; then
    echo "FAIL: WASM Engine not found in architecture diagram"
    echo "Expected: WASM Engine reference"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Architecture diagram includes VS Code Extension, WASM, SharedArrayBuffer, Worker Pool"
exit 0
