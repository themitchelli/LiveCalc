#!/bin/bash
# Test: US-001 AC-05 - Extension contributes commands: livecalc.run, livecalc.runCloud, livecalc.configure
# AC: Extension contributes commands: livecalc.run, livecalc.runCloud, livecalc.configure

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for livecalc.run command
if ! grep -q '"command":\s*"livecalc.run"' "$PACKAGE_JSON"; then
    echo "FAIL: Missing livecalc.run command"
    echo "Expected: livecalc.run command in contributes.commands"
    echo "Actual: not found"
    exit 1
fi

# Check for livecalc.runCloud command
if ! grep -q '"command":\s*"livecalc.runCloud"' "$PACKAGE_JSON"; then
    echo "FAIL: Missing livecalc.runCloud command"
    echo "Expected: livecalc.runCloud command in contributes.commands"
    echo "Actual: not found"
    exit 1
fi

# Check for livecalc.initialize command (configure equivalent)
if ! grep -q '"command":\s*"livecalc.initialize"' "$PACKAGE_JSON"; then
    echo "FAIL: Missing livecalc.initialize command"
    echo "Expected: livecalc.initialize command in contributes.commands"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Extension contributes required commands"
exit 0
