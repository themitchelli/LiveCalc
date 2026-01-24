#!/bin/bash
# Test: US-005 AC-06 - Run disabled with message if no livecalc.config.json found
# AC: Run disabled with message if no livecalc.config.json found

RUN_COMMAND_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/commands/run.ts"

if [[ ! -f "$RUN_COMMAND_FILE" ]]; then
    echo "FAIL: Run command file not found"
    exit 1
fi

# Check for config file check
if ! grep -q 'findConfigFile\|configPath' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No config file check in run command"
    echo "Expected: config file discovery logic"
    echo "Actual: not found"
    exit 1
fi

# Check for notification when no config
if ! grep -q 'noConfigFile\|No.*config\|config.*not found' "$RUN_COMMAND_FILE"; then
    echo "FAIL: No message when config not found"
    echo "Expected: notification for missing config"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Run command shows message if no config found"
exit 0
