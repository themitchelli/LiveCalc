#!/bin/bash
# Test: verify command exists to reopen panel
# AC: Panel can be closed and reopened via command

PACKAGE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for livecalc.openResults command
if ! grep -q '"livecalc.openResults"' "$PACKAGE_FILE"; then
    echo "FAIL: livecalc.openResults command not found in package.json"
    exit 1
fi

# Check command has a title
if ! grep -q '"Open Results Panel"' "$PACKAGE_FILE"; then
    echo "FAIL: Open Results Panel command title not found"
    exit 1
fi

echo "PASS: Panel reopen command (livecalc.openResults) registered"
exit 0
