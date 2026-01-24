#!/bin/bash
# Test: verify FADE.md contains repository link
# AC: Repository link points to github.com/themitchelli/LiveCalc

FADE_FILE="./FADE.md"

# Check file exists
if [[ ! -f "$FADE_FILE" ]]; then
    echo "FAIL: FADE.md file not found"
    exit 1
fi

# Check for repository link
if ! grep -q "github.com/themitchelli/LiveCalc" "$FADE_FILE"; then
    echo "FAIL: Repository link not found"
    echo "Expected: github.com/themitchelli/LiveCalc"
    echo "Actual: Not found in FADE.md"
    exit 1
fi

echo "PASS: Repository link points to github.com/themitchelli/LiveCalc"
exit 0
