#!/bin/bash
# Test: US-003 AC-10 - JSON schema published for IntelliSense in config file
# AC: JSON schema published for IntelliSense in config file

PACKAGE_JSON="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/package.json"

# Check for jsonValidation contribution
if ! grep -q '"jsonValidation"' "$PACKAGE_JSON"; then
    echo "FAIL: No jsonValidation contribution"
    echo "Expected: jsonValidation in contributes"
    echo "Actual: not found"
    exit 1
fi

# Check it targets livecalc.config.json
if ! grep -q '"livecalc.config.json"' "$PACKAGE_JSON"; then
    echo "FAIL: jsonValidation doesn't target livecalc.config.json"
    echo "Expected: fileMatch for livecalc.config.json"
    echo "Actual: not found"
    exit 1
fi

# Check it references the schema
if ! grep -q 'livecalc.config.schema.json' "$PACKAGE_JSON"; then
    echo "FAIL: jsonValidation doesn't reference schema"
    echo "Expected: url to livecalc.config.schema.json"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: JSON schema configured for IntelliSense in livecalc.config.json"
exit 0
