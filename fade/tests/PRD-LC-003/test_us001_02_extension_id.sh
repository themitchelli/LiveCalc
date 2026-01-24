#!/bin/bash
# Test: US-001 AC-02 - Extension ID: livecalc.livecalc-vscode
# AC: Extension ID: livecalc.livecalc-vscode

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Extract name and publisher from package.json
NAME=$(grep -o '"name":\s*"[^"]*"' "$PACKAGE_JSON" | head -1 | cut -d'"' -f4)
PUBLISHER=$(grep -o '"publisher":\s*"[^"]*"' "$PACKAGE_JSON" | cut -d'"' -f4)

EXPECTED_ID="livecalc.livecalc-vscode"
ACTUAL_ID="${PUBLISHER}.${NAME}"

if [[ "$ACTUAL_ID" != "$EXPECTED_ID" ]]; then
    echo "FAIL: Extension ID mismatch"
    echo "Expected: $EXPECTED_ID"
    echo "Actual: $ACTUAL_ID"
    exit 1
fi

echo "PASS: Extension ID is $EXPECTED_ID"
exit 0
