#!/bin/bash
# Test: US-006 AC-12 - Resolve paths relative to config file location
# AC: Resolve paths relative to config file location

DATA_LOADER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/data/data-loader.ts"
RUN_COMMAND_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/commands/run.ts"

# Check for configDir parameter in data loading
if ! grep -q 'configDir' "$DATA_LOADER_FILE"; then
    echo "FAIL: No configDir parameter in data loader"
    echo "Expected: configDir for relative path resolution"
    echo "Actual: not found"
    exit 1
fi

# Check that run command passes config directory
if ! grep -q 'configDir\|dirname.*configPath' "$RUN_COMMAND_FILE"; then
    echo "FAIL: Run command doesn't pass config directory"
    echo "Expected: config directory passed to data loader"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Paths resolved relative to config file location"
exit 0
