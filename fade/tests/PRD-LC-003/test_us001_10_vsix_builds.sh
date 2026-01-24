#!/bin/bash
# Test: US-001 AC-10 - .vsix package builds successfully
# AC: .vsix package builds successfully

VSCODE_EXT_DIR="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode"

# Check if a .vsix file exists (proof of successful build)
VSIX_FILES=$(find "$VSCODE_EXT_DIR" -maxdepth 1 -name "*.vsix" -type f 2>/dev/null)

if [[ -z "$VSIX_FILES" ]]; then
    echo "FAIL: No .vsix file found"
    echo "Expected: .vsix package exists"
    echo "Actual: no .vsix file found in $VSCODE_EXT_DIR"
    exit 1
fi

# Check that at least one .vsix is non-empty
for VSIX in $VSIX_FILES; do
    if [[ -s "$VSIX" ]]; then
        SIZE=$(stat -f %z "$VSIX" 2>/dev/null || stat --printf="%s" "$VSIX" 2>/dev/null)
        echo "PASS: .vsix package exists: $(basename "$VSIX") ($SIZE bytes)"
        exit 0
    fi
done

echo "FAIL: .vsix files are empty"
echo "Expected: non-empty .vsix package"
echo "Actual: all .vsix files are empty"
exit 1
