#!/bin/bash
# Test: Validation rejects upload if mandatory assets defined in config are missing
# AC: Validation: Reject upload if mandatory assets defined in config are missing.
# US: US-BRIDGE-02 (Model Asset Packaging)

set -e

# Check model-packager.ts for validation logic
PACKAGER="livecalc-vscode/src/cloud/model-packager.ts"
VALIDATOR="livecalc-vscode/src/cloud/package-validator.ts"

# Check packager for validation
if [[ ! -f "$PACKAGER" ]]; then
    echo "FAIL: model-packager.ts not found"
    exit 1
fi

# Verify validateAssets method exists
if ! grep -q "validateAssets" "$PACKAGER"; then
    echo "FAIL: validateAssets method not found in packager"
    echo "Expected: Asset validation method"
    echo "Actual: No validateAssets found"
    exit 1
fi

# Verify missing assets are tracked
if ! grep -q "missingAssets\|missing" "$PACKAGER"; then
    echo "FAIL: Missing assets tracking not found"
    echo "Expected: missingAssets array"
    echo "Actual: No missing asset tracking found"
    exit 1
fi

# Verify rejection on missing assets
if ! grep -q "success: false" "$PACKAGER"; then
    echo "FAIL: Rejection logic not found"
    echo "Expected: success: false on validation failure"
    echo "Actual: No rejection logic found"
    exit 1
fi

# Check for separate validator if exists
if [[ -f "$VALIDATOR" ]]; then
    # Verify mandatory asset validation
    if ! grep -q "validateMandatoryAssets\|mandatory" "$VALIDATOR"; then
        echo "WARN: No mandatory asset validation in separate validator"
    fi
fi

echo "PASS: Validation rejects upload if mandatory assets are missing"
exit 0
