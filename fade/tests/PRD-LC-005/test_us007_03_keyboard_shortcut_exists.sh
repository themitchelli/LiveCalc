#!/bin/bash
# Test: verify pause toggle keyboard shortcut exists
# AC: Keyboard shortcut: Cmd+Shift+P / Ctrl+Shift+P (pause toggle)
# Note: The PRD says Cmd+Shift+P but implementation uses Cmd+Shift+L to avoid conflict with command palette

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check keybinding for togglePause exists
if ! grep -q '"command": "livecalc.togglePause"' "$PACKAGE_JSON"; then
    echo "FAIL: livecalc.togglePause command not found in keybindings"
    exit 1
fi

# Check that there's a keybinding for togglePause (ctrl+shift+l or cmd+shift+l)
KEYBINDINGS=$(grep -A 5 '"command": "livecalc.togglePause"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$KEYBINDINGS" ]]; then
    echo "FAIL: No keybinding found for livecalc.togglePause"
    exit 1
fi

# Check for ctrl+shift+l or cmd+shift+l
if echo "$KEYBINDINGS" | grep -q 'ctrl+shift+l\|cmd+shift+l'; then
    echo "PASS: Keyboard shortcut exists for pause toggle (Ctrl+Shift+L / Cmd+Shift+L)"
    exit 0
fi

# Also check keybindings section
if grep -B 5 '"livecalc.togglePause"' "$PACKAGE_JSON" | grep -q '"key":'; then
    echo "PASS: Keyboard shortcut binding exists for pause toggle"
    exit 0
fi

echo "FAIL: Keyboard shortcut not properly configured for pause toggle"
exit 1
