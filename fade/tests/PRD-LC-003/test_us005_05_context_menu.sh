#!/bin/bash
# Test: US-005 AC-05 - Command available via right-click context menu in .mga files
# AC: Command available via right-click context menu in .mga files

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for editor/context menu
if ! grep -q '"editor/context"' "$PACKAGE_JSON"; then
    echo "FAIL: No editor/context menu contribution"
    echo "Expected: editor/context in menus"
    echo "Actual: not found"
    exit 1
fi

# Check that livecalc.run is in context menu
if ! grep -A10 '"editor/context"' "$PACKAGE_JSON" | grep -q 'livecalc.run'; then
    echo "FAIL: livecalc.run not in context menu"
    echo "Expected: livecalc.run in editor/context menu"
    echo "Actual: not found"
    exit 1
fi

# Check for mga language condition
if ! grep -A10 '"editor/context"' "$PACKAGE_JSON" | grep -q 'mga'; then
    echo "FAIL: Context menu not restricted to MGA files"
    echo "Expected: 'when' condition for mga language"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Run command available in context menu for .mga files"
exit 0
