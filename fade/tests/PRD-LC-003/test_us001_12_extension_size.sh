#!/bin/bash
# Test: US-001 AC-12 - Extension size < 10MB (including WASM)
# AC: Extension size < 10MB (including WASM)

VSCODE_EXT_DIR="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode"
MAX_SIZE_BYTES=$((10 * 1024 * 1024))  # 10MB in bytes

# Find the .vsix file
VSIX_FILE=$(find "$VSCODE_EXT_DIR" -maxdepth 1 -name "*.vsix" -type f | head -n 1)

if [[ -z "$VSIX_FILE" ]]; then
    echo "FAIL: No .vsix file found to check size"
    echo "Expected: .vsix package exists"
    echo "Actual: no .vsix file found"
    exit 1
fi

# Get file size (macOS and Linux compatible)
SIZE=$(stat -f %z "$VSIX_FILE" 2>/dev/null || stat --printf="%s" "$VSIX_FILE" 2>/dev/null)

if [[ -z "$SIZE" ]]; then
    echo "FAIL: Could not determine file size"
    exit 1
fi

if [[ "$SIZE" -gt "$MAX_SIZE_BYTES" ]]; then
    SIZE_MB=$(echo "scale=2; $SIZE / 1024 / 1024" | bc)
    echo "FAIL: Extension size exceeds 10MB"
    echo "Expected: < 10MB"
    echo "Actual: ${SIZE_MB}MB"
    exit 1
fi

SIZE_MB=$(echo "scale=2; $SIZE / 1024 / 1024" | bc 2>/dev/null || echo "$(($SIZE / 1024 / 1024))")
echo "PASS: Extension size is ${SIZE_MB}MB (under 10MB limit)"
exit 0
