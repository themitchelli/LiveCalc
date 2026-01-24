#!/bin/bash
# Test: US-005 AC-04 - Command available via editor title bar (play icon)
# AC: Command available via editor title bar (play icon)

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for menus section
if ! grep -q '"menus"' "$PACKAGE_JSON"; then
    echo "FAIL: No menus section"
    echo "Expected: menus in contributes"
    echo "Actual: not found"
    exit 1
fi

# Check for editor/title menu
if ! grep -q '"editor/title"' "$PACKAGE_JSON"; then
    echo "FAIL: No editor/title menu contribution"
    echo "Expected: editor/title in menus"
    echo "Actual: not found"
    exit 1
fi

# Check that livecalc.run is in editor title
if ! grep -A10 '"editor/title"' "$PACKAGE_JSON" | grep -q 'livecalc.run'; then
    echo "FAIL: livecalc.run not in editor title bar"
    echo "Expected: livecalc.run in editor/title menu"
    echo "Actual: not found"
    exit 1
fi

# Check for play icon
if ! grep -q '\$(play)' "$PACKAGE_JSON"; then
    echo "FAIL: No play icon defined for command"
    echo "Expected: \$(play) icon"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Run command available in editor title bar with play icon"
exit 0
