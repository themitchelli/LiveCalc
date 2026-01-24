#!/bin/bash
# Test: US-005 AC-02 - Keyboard shortcut: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows/Linux)
# AC: Keyboard shortcut: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows/Linux)

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for keybindings section
if ! grep -q '"keybindings"' "$PACKAGE_JSON"; then
    echo "FAIL: No keybindings section"
    echo "Expected: keybindings in contributes"
    echo "Actual: not found"
    exit 1
fi

# Check for ctrl+shift+r binding (Windows/Linux)
if ! grep -q 'ctrl+shift+r' "$PACKAGE_JSON"; then
    echo "FAIL: Missing Ctrl+Shift+R shortcut"
    echo "Expected: ctrl+shift+r keybinding"
    echo "Actual: not found"
    exit 1
fi

# Check for cmd+shift+r binding (Mac)
if ! grep -q 'cmd+shift+r' "$PACKAGE_JSON"; then
    echo "FAIL: Missing Cmd+Shift+R shortcut (Mac)"
    echo "Expected: cmd+shift+r keybinding"
    echo "Actual: not found"
    exit 1
fi

# Check that the keybinding is for livecalc.run
if ! grep -B5 -A5 'shift+r' "$PACKAGE_JSON" | grep -q 'livecalc.run'; then
    echo "FAIL: Keybinding not associated with livecalc.run"
    echo "Expected: keybinding for livecalc.run command"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Keyboard shortcut configured (Cmd/Ctrl+Shift+R)"
exit 0
