#!/bin/bash
# Test: US-002 AC-13 - Language configuration for brackets, comments, auto-closing
# AC: Language configuration for brackets, comments, auto-closing

VSCODE_EXT_DIR="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode"
LANG_CONFIG="$VSCODE_EXT_DIR/language-configuration.json"

if [[ ! -f "$LANG_CONFIG" ]]; then
    echo "FAIL: Language configuration file not found"
    echo "Expected: language-configuration.json exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for comments configuration
if ! grep -q '"comments"' "$LANG_CONFIG"; then
    echo "FAIL: No comments configuration"
    echo "Expected: comments config in language-configuration.json"
    echo "Actual: not found"
    exit 1
fi

# Check for brackets configuration
if ! grep -q '"brackets"' "$LANG_CONFIG"; then
    echo "FAIL: No brackets configuration"
    echo "Expected: brackets config in language-configuration.json"
    echo "Actual: not found"
    exit 1
fi

# Check for autoClosingPairs
if ! grep -q '"autoClosingPairs"' "$LANG_CONFIG"; then
    echo "FAIL: No auto-closing pairs configuration"
    echo "Expected: autoClosingPairs config"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Language configuration has brackets, comments, and auto-closing pairs"
exit 0
