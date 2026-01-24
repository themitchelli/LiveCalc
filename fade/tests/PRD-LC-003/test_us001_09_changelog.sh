#!/bin/bash
# Test: US-001 AC-09 - CHANGELOG.md initialized
# AC: CHANGELOG.md initialized

CHANGELOG_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/CHANGELOG.md"

# Check if CHANGELOG exists
if [[ ! -f "$CHANGELOG_FILE" ]]; then
    echo "FAIL: CHANGELOG.md not found"
    echo "Expected: CHANGELOG.md exists"
    echo "Actual: file not found"
    exit 1
fi

# Check that it's not empty
if [[ ! -s "$CHANGELOG_FILE" ]]; then
    echo "FAIL: CHANGELOG.md is empty"
    echo "Expected: CHANGELOG.md has content"
    echo "Actual: file is empty"
    exit 1
fi

# Check for version header (either semantic or date-based)
if ! grep -qE '^\#|^\[' "$CHANGELOG_FILE"; then
    echo "FAIL: CHANGELOG.md missing version/header format"
    echo "Expected: changelog format with headers"
    echo "Actual: no recognized format found"
    exit 1
fi

echo "PASS: CHANGELOG.md is initialized"
exit 0
