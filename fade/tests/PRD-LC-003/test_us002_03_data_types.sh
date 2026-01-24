#!/bin/bash
# Test: US-002 AC-03 - Data types highlighted: TERM, PREMIUM, SUM_ASSURED, AGE, GENDER
# AC: Data types highlighted: TERM, PREMIUM, SUM_ASSURED, AGE, GENDER

GRAMMAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/syntaxes/mga.tmLanguage.json"

if [[ ! -f "$GRAMMAR_FILE" ]]; then
    echo "FAIL: Grammar file not found"
    exit 1
fi

# Check for data type keywords
DATA_TYPES=(TERM PREMIUM SUM_ASSURED AGE GENDER)
for TYPE in "${DATA_TYPES[@]}"; do
    if ! grep -q "$TYPE" "$GRAMMAR_FILE"; then
        echo "FAIL: Missing data type: $TYPE"
        echo "Expected: $TYPE in grammar file"
        echo "Actual: not found"
        exit 1
    fi
done

echo "PASS: Data types defined in grammar"
exit 0
