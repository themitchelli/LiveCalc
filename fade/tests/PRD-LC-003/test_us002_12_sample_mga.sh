#!/bin/bash
# Test: US-002 AC-12 - Sample .mga file included in extension for testing
# AC: Sample .mga file included in extension for testing

VSCODE_EXT_DIR="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode"

# Find .mga files in the extension
MGA_FILES=$(find "$VSCODE_EXT_DIR" -name "*.mga" -type f 2>/dev/null)

if [[ -z "$MGA_FILES" ]]; then
    echo "FAIL: No sample .mga file found"
    echo "Expected: at least one .mga file in extension"
    echo "Actual: no .mga files found"
    exit 1
fi

# Check that at least one .mga file has meaningful content
for MGA_FILE in $MGA_FILES; do
    # Check for basic MGA keywords
    if grep -q "PRODUCT\|PROJECTION" "$MGA_FILE"; then
        echo "PASS: Sample .mga file found: $MGA_FILE"
        exit 0
    fi
done

echo "FAIL: No valid sample .mga file found"
echo "Expected: .mga file with PRODUCT or PROJECTION keyword"
echo "Actual: no valid content found"
exit 1
