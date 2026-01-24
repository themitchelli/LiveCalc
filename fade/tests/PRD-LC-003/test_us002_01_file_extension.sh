#!/bin/bash
# Test: US-002 AC-01 - .mga file extension associated with 'MGA' language
# AC: .mga file extension associated with 'MGA' language

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for .mga extension in languages configuration
if ! grep -q '".mga"' "$PACKAGE_JSON"; then
    echo "FAIL: .mga extension not configured"
    echo "Expected: .mga in language extensions"
    echo "Actual: not found"
    exit 1
fi

# Check for MGA language id
if ! grep -q '"id":\s*"mga"' "$PACKAGE_JSON"; then
    echo "FAIL: MGA language not defined"
    echo "Expected: language id 'mga' in contributes.languages"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: .mga extension associated with MGA language"
exit 0
