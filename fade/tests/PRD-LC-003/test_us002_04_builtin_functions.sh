#!/bin/bash
# Test: US-002 AC-04 - Built-in functions highlighted: SUM, NPV, LOOKUP, MIN, MAX, ABS
# AC: Built-in functions highlighted: SUM, NPV, LOOKUP, MIN, MAX, ABS

GRAMMAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/syntaxes/mga.tmLanguage.json"

if [[ ! -f "$GRAMMAR_FILE" ]]; then
    echo "FAIL: Grammar file not found"
    exit 1
fi

# Check for entity.name.function scope (indicates function highlighting)
if ! grep -q "entity.name.function" "$GRAMMAR_FILE"; then
    echo "FAIL: No function scope defined"
    echo "Expected: entity.name.function.mga scope"
    echo "Actual: not found"
    exit 1
fi

# Check for built-in functions
FUNCTIONS=(SUM NPV LOOKUP MIN MAX ABS)
for FUNC in "${FUNCTIONS[@]}"; do
    if ! grep -q "$FUNC" "$GRAMMAR_FILE"; then
        echo "FAIL: Missing built-in function: $FUNC"
        echo "Expected: $FUNC in grammar file"
        echo "Actual: not found"
        exit 1
    fi
done

echo "PASS: Built-in functions defined in grammar"
exit 0
