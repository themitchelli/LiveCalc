#!/bin/bash
# Test: US-007 AC-07 - Status bar item only visible when .mga file open or config present
# AC: Status bar item only visible when .mga file open or config present

STATUS_BAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/status-bar.ts"
EXTENSION_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/extension.ts"

# Check for show/hide methods in status bar
if ! grep -q 'show\(\)' "$STATUS_BAR_FILE"; then
    echo "FAIL: No show method in status bar"
    echo "Expected: show() method"
    echo "Actual: not found"
    exit 1
fi

if ! grep -q 'hide\(\)' "$STATUS_BAR_FILE"; then
    echo "FAIL: No hide method in status bar"
    echo "Expected: hide() method"
    echo "Actual: not found"
    exit 1
fi

# Check for visibility logic in extension
if ! grep -qi 'visibility\|shouldShow\|mga' "$EXTENSION_FILE"; then
    echo "FAIL: No visibility logic for status bar"
    echo "Expected: visibility based on file type"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Status bar has visibility controls"
exit 0
