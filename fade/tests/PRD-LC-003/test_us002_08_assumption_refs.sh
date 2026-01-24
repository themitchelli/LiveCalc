#!/bin/bash
# Test: US-002 AC-08 - Assumption references highlighted: assumptions://name:version
# AC: Assumption references highlighted: assumptions://name:version

GRAMMAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/syntaxes/mga.tmLanguage.json"

if [[ ! -f "$GRAMMAR_FILE" ]]; then
    echo "FAIL: Grammar file not found"
    exit 1
fi

# Check for assumptions:// pattern
if ! grep -q "assumptions://" "$GRAMMAR_FILE"; then
    echo "FAIL: No assumptions:// reference pattern"
    echo "Expected: assumptions:// pattern in grammar"
    echo "Actual: not found"
    exit 1
fi

# Check for dedicated scope for assumption references
if ! grep -q "assumption\|reference" "$GRAMMAR_FILE"; then
    echo "FAIL: No assumption reference scope"
    echo "Expected: scope for assumption references"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Assumption references (assumptions://) are highlighted"
exit 0
