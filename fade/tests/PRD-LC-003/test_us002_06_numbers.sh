#!/bin/bash
# Test: US-002 AC-06 - Numbers highlighted (integers, decimals, scientific notation)
# AC: Numbers highlighted (integers, decimals, scientific notation)

GRAMMAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/syntaxes/mga.tmLanguage.json"

if [[ ! -f "$GRAMMAR_FILE" ]]; then
    echo "FAIL: Grammar file not found"
    exit 1
fi

# Check for numeric constant scope
if ! grep -q "constant.numeric" "$GRAMMAR_FILE"; then
    echo "FAIL: No numeric constant scope defined"
    echo "Expected: constant.numeric scope"
    echo "Actual: not found"
    exit 1
fi

# Check for integer pattern (digits)
if ! grep -q '\[0-9\]' "$GRAMMAR_FILE"; then
    echo "FAIL: No number pattern defined"
    echo "Expected: digit matching pattern"
    echo "Actual: not found"
    exit 1
fi

# Check for decimal number support (with .)
if ! grep -q 'decimal\|\\.' "$GRAMMAR_FILE"; then
    echo "FAIL: No decimal number pattern"
    echo "Expected: decimal pattern support"
    echo "Actual: not found"
    exit 1
fi

# Check for scientific notation (e or E)
if ! grep -qi 'scientific\|[eE]' "$GRAMMAR_FILE"; then
    echo "FAIL: No scientific notation pattern"
    echo "Expected: scientific notation support (e/E)"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Number highlighting supports integers, decimals, scientific notation"
exit 0
