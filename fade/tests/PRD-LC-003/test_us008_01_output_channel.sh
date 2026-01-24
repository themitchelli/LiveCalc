#!/bin/bash
# Test: US-008 AC-01 - Output channel 'LiveCalc' created on activation
# AC: Output channel 'LiveCalc' created on activation

LOGGER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/logging/logger.ts"

if [[ ! -f "$LOGGER_FILE" ]]; then
    echo "FAIL: Logger file not found"
    echo "Expected: src/logging/logger.ts exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for output channel creation
if ! grep -q 'createOutputChannel' "$LOGGER_FILE"; then
    echo "FAIL: No output channel creation"
    echo "Expected: createOutputChannel call"
    echo "Actual: not found"
    exit 1
fi

# Check for 'LiveCalc' channel name
if ! grep -q "'LiveCalc'" "$LOGGER_FILE"; then
    echo "FAIL: Output channel not named 'LiveCalc'"
    echo "Expected: output channel named 'LiveCalc'"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Output channel 'LiveCalc' is created"
exit 0
