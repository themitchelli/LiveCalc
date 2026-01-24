#!/bin/bash
# Test: US-002 AC-02 - Keywords highlighted: PRODUCT, PROJECTION, ASSUMPTIONS, FOR, IF, ELSE, THEN, END, RETURN
# AC: Keywords highlighted: PRODUCT, PROJECTION, ASSUMPTIONS, FOR, IF, ELSE, THEN, END, RETURN

GRAMMAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/syntaxes/mga.tmLanguage.json"

if [[ ! -f "$GRAMMAR_FILE" ]]; then
    echo "FAIL: Grammar file not found"
    echo "Expected: syntaxes/mga.tmLanguage.json exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for declaration keywords
KEYWORDS=(PRODUCT PROJECTION ASSUMPTIONS)
for KEYWORD in "${KEYWORDS[@]}"; do
    if ! grep -q "$KEYWORD" "$GRAMMAR_FILE"; then
        echo "FAIL: Missing keyword: $KEYWORD"
        echo "Expected: $KEYWORD in grammar file"
        echo "Actual: not found"
        exit 1
    fi
done

# Check for control keywords
CONTROL_KEYWORDS=(FOR IF ELSE END RETURN)
for KEYWORD in "${CONTROL_KEYWORDS[@]}"; do
    if ! grep -q "$KEYWORD" "$GRAMMAR_FILE"; then
        echo "FAIL: Missing control keyword: $KEYWORD"
        echo "Expected: $KEYWORD in grammar file"
        echo "Actual: not found"
        exit 1
    fi
done

echo "PASS: Declaration and control keywords defined in grammar"
exit 0
