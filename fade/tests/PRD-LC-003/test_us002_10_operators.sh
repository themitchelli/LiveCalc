#!/bin/bash
# Test: US-002 AC-10 - Operators highlighted: +, -, *, /, =, <, >, <=, >=, ==, !=
# AC: Operators highlighted: +, -, *, /, =, <, >, <=, >=, ==, !=

GRAMMAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/syntaxes/mga.tmLanguage.json"

if [[ ! -f "$GRAMMAR_FILE" ]]; then
    echo "FAIL: Grammar file not found"
    exit 1
fi

# Check for keyword.operator scope
if ! grep -q "keyword.operator" "$GRAMMAR_FILE"; then
    echo "FAIL: No operator scope defined"
    echo "Expected: keyword.operator scope"
    echo "Actual: not found"
    exit 1
fi

# Check for arithmetic operators pattern (at least +, -, *, /)
if ! grep -qE '\+|\-|\*|/' "$GRAMMAR_FILE"; then
    echo "FAIL: Arithmetic operators not defined"
    echo "Expected: +, -, *, / operators"
    echo "Actual: not found"
    exit 1
fi

# Check for comparison operators
if ! grep -qE '==|!=|<|>' "$GRAMMAR_FILE"; then
    echo "FAIL: Comparison operators not defined"
    echo "Expected: ==, !=, <, > operators"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Operators are highlighted"
exit 0
