#!/bin/bash
# Test: verify export to clipboard with summary statistics as text
# AC: Export to clipboard: summary statistics as text

EXPORT_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/export.ts"

# Check exportToClipboard method exists
if ! grep -q "exportToClipboard" "$EXPORT_FILE"; then
    echo "FAIL: exportToClipboard method not found"
    exit 1
fi

# Check buildClipboardText function exists
if ! grep -q "buildClipboardText" "$EXPORT_FILE"; then
    echo "FAIL: buildClipboardText function not found"
    exit 1
fi

# Check clipboard uses vscode.env.clipboard
if ! grep -q "clipboard.writeText" "$EXPORT_FILE"; then
    echo "FAIL: clipboard.writeText not used"
    exit 1
fi

# Check clipboard text includes summary header
if ! grep -q "LiveCalc Results Summary" "$EXPORT_FILE"; then
    echo "FAIL: 'LiveCalc Results Summary' header not found"
    exit 1
fi

echo "PASS: Export to clipboard with summary statistics as text"
exit 0
