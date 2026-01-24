#!/bin/bash
# Test: US-005 AC-01 - Command 'LiveCalc: Run' registered with ID livecalc.run
# AC: Command 'LiveCalc: Run' registered with ID livecalc.run

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for livecalc.run command
if ! grep -q '"command":\s*"livecalc.run"' "$PACKAGE_JSON"; then
    echo "FAIL: livecalc.run command not registered"
    echo "Expected: livecalc.run in contributes.commands"
    echo "Actual: not found"
    exit 1
fi

# Check for "Run" title
if ! grep -A2 '"livecalc.run"' "$PACKAGE_JSON" | grep -qi 'run'; then
    echo "FAIL: Command doesn't have 'Run' title"
    echo "Expected: title contains 'Run'"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Command 'LiveCalc: Run' registered with ID livecalc.run"
exit 0
