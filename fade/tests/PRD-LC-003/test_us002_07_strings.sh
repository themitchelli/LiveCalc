#!/bin/bash
# Test: US-002 AC-07 - Strings highlighted (single and double quotes)
# AC: Strings highlighted (single and double quotes)

GRAMMAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/syntaxes/mga.tmLanguage.json"

if [[ ! -f "$GRAMMAR_FILE" ]]; then
    echo "FAIL: Grammar file not found"
    exit 1
fi

# Check for string scope
if ! grep -q "string.quoted" "$GRAMMAR_FILE"; then
    echo "FAIL: No string quoted scope defined"
    echo "Expected: string.quoted scope"
    echo "Actual: not found"
    exit 1
fi

# Check for double quote support
if ! grep -q "double" "$GRAMMAR_FILE"; then
    echo "FAIL: No double quote string support"
    echo "Expected: string.quoted.double"
    echo "Actual: not found"
    exit 1
fi

# Check for single quote support
if ! grep -q "single" "$GRAMMAR_FILE"; then
    echo "FAIL: No single quote string support"
    echo "Expected: string.quoted.single"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: String highlighting supports single and double quotes"
exit 0
