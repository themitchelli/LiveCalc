#!/bin/bash
# Test: US-002 AC-09 - Local file references highlighted: local://path/to/file.csv
# AC: Local file references highlighted: local://path/to/file.csv

GRAMMAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/syntaxes/mga.tmLanguage.json"

if [[ ! -f "$GRAMMAR_FILE" ]]; then
    echo "FAIL: Grammar file not found"
    exit 1
fi

# Check for local:// pattern
if ! grep -q "local://" "$GRAMMAR_FILE"; then
    echo "FAIL: No local:// reference pattern"
    echo "Expected: local:// pattern in grammar"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Local file references (local://) are highlighted"
exit 0
