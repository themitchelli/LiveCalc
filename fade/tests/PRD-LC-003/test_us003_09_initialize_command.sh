#!/bin/bash
# Test: US-003 AC-09 - Command 'LiveCalc: Initialize Project' creates default config
# AC: Command 'LiveCalc: Initialize Project' creates default config

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"
INIT_COMMAND_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/commands/initialize.ts"

# Check command is registered in package.json
if ! grep -q '"livecalc.initialize"' "$PACKAGE_JSON"; then
    echo "FAIL: livecalc.initialize command not registered"
    echo "Expected: livecalc.initialize in contributes.commands"
    echo "Actual: not found"
    exit 1
fi

# Check initialize command implementation exists
if [[ ! -f "$INIT_COMMAND_FILE" ]]; then
    echo "FAIL: Initialize command implementation not found"
    echo "Expected: src/commands/initialize.ts exists"
    echo "Actual: file not found"
    exit 1
fi

# Check that it creates a default config
if ! grep -q 'livecalc.config.json' "$INIT_COMMAND_FILE"; then
    echo "FAIL: Initialize command doesn't create livecalc.config.json"
    echo "Expected: creates livecalc.config.json"
    echo "Actual: not found in implementation"
    exit 1
fi

echo "PASS: LiveCalc: Initialize Project command is registered and creates config"
exit 0
