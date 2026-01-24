#!/bin/bash
# Test: US-001 AC-06 - Extension icon (128x128 PNG) with LiveCalc branding
# AC: Extension icon (128x128 PNG) with LiveCalc branding

VSCODE_EXT_DIR="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode"
PACKAGE_JSON="$VSCODE_EXT_DIR/package.json"

# Check for icon field in package.json
if ! grep -q '"icon"' "$PACKAGE_JSON"; then
    echo "FAIL: No icon field in package.json"
    echo "Expected: icon field present"
    echo "Actual: not found"
    exit 1
fi

# Get icon path from package.json (top-level icon field only - lines with .png)
ICON_PATH=$(grep '"icon".*\.png' "$PACKAGE_JSON" | head -1 | sed 's/.*"icon"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

# Check if icon path was found
if [[ -z "$ICON_PATH" ]]; then
    echo "FAIL: Could not extract icon path"
    echo "Expected: icon path with .png"
    echo "Actual: empty"
    exit 1
fi

# Check if icon file exists
if [[ ! -f "$VSCODE_EXT_DIR/$ICON_PATH" ]]; then
    echo "FAIL: Icon file not found"
    echo "Expected: $ICON_PATH to exist"
    echo "Actual: file not found at $VSCODE_EXT_DIR/$ICON_PATH"
    exit 1
fi

# Check if it's a PNG file
if [[ ! "$ICON_PATH" == *.png ]]; then
    echo "FAIL: Icon is not a PNG file"
    echo "Expected: PNG file"
    echo "Actual: $ICON_PATH"
    exit 1
fi

echo "PASS: Extension has icon configured"
exit 0
