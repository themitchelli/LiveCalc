#!/bin/bash
# Test: verify FADE.md includes Off-Limits Modules section
# AC: Off-Limits Modules section includes: livecalc-engine/cpp/build/ (generated), node_modules/ (dependencies)

FADE_FILE="./FADE.md"

# Check file exists
if [[ ! -f "$FADE_FILE" ]]; then
    echo "FAIL: FADE.md file not found"
    exit 1
fi

# Check for Off-Limits section
if ! grep -qi "Off-Limits" "$FADE_FILE"; then
    echo "FAIL: Off-Limits Modules section not found"
    echo "Expected: Off-Limits Modules section"
    echo "Actual: Not found"
    exit 1
fi

# Check for build directory mention
if ! grep -q "build/" "$FADE_FILE"; then
    echo "FAIL: build/ directory not listed in Off-Limits"
    echo "Expected: build/ as off-limits (generated)"
    echo "Actual: Not found"
    exit 1
fi

# Check for node_modules mention
if ! grep -q "node_modules" "$FADE_FILE"; then
    echo "FAIL: node_modules/ not listed in Off-Limits"
    echo "Expected: node_modules/ as off-limits (dependencies)"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Off-Limits Modules includes build/ and node_modules/"
exit 0
