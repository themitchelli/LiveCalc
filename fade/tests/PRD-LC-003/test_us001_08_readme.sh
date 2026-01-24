#!/bin/bash
# Test: US-001 AC-08 - README.md with installation and quick start guide
# AC: README.md with installation and quick start guide

README_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/README.md"

# Check if README exists
if [[ ! -f "$README_FILE" ]]; then
    echo "FAIL: README.md not found"
    echo "Expected: README.md exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for installation content
if ! grep -qi "install" "$README_FILE"; then
    echo "FAIL: README missing installation instructions"
    echo "Expected: installation instructions present"
    echo "Actual: 'install' not found in README"
    exit 1
fi

# Check for quick start content
if ! grep -qi "quick start" "$README_FILE"; then
    echo "FAIL: README missing quick start guide"
    echo "Expected: quick start section present"
    echo "Actual: 'quick start' not found in README"
    exit 1
fi

echo "PASS: README.md has installation and quick start content"
exit 0
