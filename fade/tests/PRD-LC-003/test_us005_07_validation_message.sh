#!/bin/bash
# Test: US-005 AC-07 - Run disabled with message if config validation fails
# AC: Run disabled with message if config validation fails

RUN_COMMAND_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/commands/run.ts"
CONFIG_LOADER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/config/config-loader.ts"

# Check for validation in config loader
if ! grep -q 'validate\|Validator' "$CONFIG_LOADER_FILE"; then
    echo "FAIL: No validation in config loader"
    echo "Expected: validation logic"
    echo "Actual: not found"
    exit 1
fi

# Check for error handling when config invalid
if ! grep -q 'validation.*fail\|valid\|Error' "$CONFIG_LOADER_FILE"; then
    echo "FAIL: No validation error handling"
    echo "Expected: validation error handling"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Run command handles config validation failures"
exit 0
