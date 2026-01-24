#!/bin/bash
# Test: US-001 AC-04 - Extension activates on .mga files or livecalc.config.json presence
# AC: Extension activates on .mga files or livecalc.config.json presence

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for onLanguage:mga activation event
if ! grep -q '"onLanguage:mga"' "$PACKAGE_JSON"; then
    echo "FAIL: Missing activation event for .mga files"
    echo "Expected: onLanguage:mga in activationEvents"
    echo "Actual: not found"
    exit 1
fi

# Check for workspaceContains:livecalc.config.json activation event
if ! grep -q '"workspaceContains:livecalc.config.json"' "$PACKAGE_JSON"; then
    echo "FAIL: Missing activation event for livecalc.config.json"
    echo "Expected: workspaceContains:livecalc.config.json in activationEvents"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Extension has correct activation events"
exit 0
