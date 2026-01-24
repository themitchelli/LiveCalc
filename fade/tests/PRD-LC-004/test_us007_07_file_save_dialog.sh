#!/bin/bash
# Test: verify file save dialog with sensible default name
# AC: File save dialog with sensible default name (e.g., 'livecalc-results-2026-01-23.csv')

EXPORT_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/export.ts"

# Check showSaveDialog is used
if ! grep -q "showSaveDialog" "$EXPORT_FILE"; then
    echo "FAIL: showSaveDialog not used"
    exit 1
fi

# Check default filename format
if ! grep -q "livecalc-results-" "$EXPORT_FILE"; then
    echo "FAIL: 'livecalc-results-' filename prefix not found"
    exit 1
fi

# Check formatTimestampForFilename function exists
if ! grep -q "formatTimestampForFilename" "$EXPORT_FILE"; then
    echo "FAIL: formatTimestampForFilename function not found"
    exit 1
fi

# Check filename includes date format
if ! grep -q "YYYY-MM-DD\|getFullYear\|getMonth\|getDate" "$EXPORT_FILE"; then
    echo "FAIL: Date formatting not found for filename"
    exit 1
fi

echo "PASS: File save dialog with sensible default name"
exit 0
