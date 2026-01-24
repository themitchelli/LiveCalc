#!/bin/bash
# Test: US-002 AC-05 - Comments highlighted: // single line and /* multi-line */
# AC: Comments highlighted: // single line and /* multi-line */

GRAMMAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/syntaxes/mga.tmLanguage.json"

if [[ ! -f "$GRAMMAR_FILE" ]]; then
    echo "FAIL: Grammar file not found"
    exit 1
fi

# Check for single-line comment scope
if ! grep -q "comment.line" "$GRAMMAR_FILE"; then
    echo "FAIL: No single-line comment scope defined"
    echo "Expected: comment.line scope"
    echo "Actual: not found"
    exit 1
fi

# Check for // comment pattern
if ! grep -q '//' "$GRAMMAR_FILE"; then
    echo "FAIL: No // pattern for single-line comments"
    echo "Expected: // pattern"
    echo "Actual: not found"
    exit 1
fi

# Check for block comment scope
if ! grep -q "comment.block" "$GRAMMAR_FILE"; then
    echo "FAIL: No block comment scope defined"
    echo "Expected: comment.block scope"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Comment highlighting defined (single-line and block)"
exit 0
