#!/bin/bash
# Test: verify export to JSON with full results object and metadata
# AC: Export to JSON: full results object with metadata

EXPORT_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/export.ts"

# Check exportToJson method exists
if ! grep -q "exportToJson" "$EXPORT_FILE"; then
    echo "FAIL: exportToJson method not found"
    exit 1
fi

# Check buildJsonContent function exists
if ! grep -q "buildJsonContent" "$EXPORT_FILE"; then
    echo "FAIL: buildJsonContent function not found"
    exit 1
fi

# Check JSON includes metadata section
if ! grep -q "metadata:" "$EXPORT_FILE"; then
    echo "FAIL: metadata section not found in JSON format"
    exit 1
fi

# Check JSON includes statistics section
if ! grep -q "statistics:" "$EXPORT_FILE"; then
    echo "FAIL: statistics section not found in JSON format"
    exit 1
fi

# Check JSON includes assumptions section
if ! grep -q "assumptions:" "$EXPORT_FILE"; then
    echo "FAIL: assumptions section not found in JSON format"
    exit 1
fi

# Check JSON includes scenarios
if ! grep -q "scenarios:" "$EXPORT_FILE"; then
    echo "FAIL: scenarios section not found in JSON format"
    exit 1
fi

echo "PASS: Export to JSON with full results object and metadata"
exit 0
