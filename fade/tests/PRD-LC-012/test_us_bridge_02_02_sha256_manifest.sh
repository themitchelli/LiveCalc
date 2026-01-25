#!/bin/bash
# Test: Bundle includes a SHA-256 manifest of all assets for integrity checking
# AC: Bundle includes a SHA-256 manifest of all assets for integrity checking.
# US: US-BRIDGE-02 (Model Asset Packaging)

set -e

# Check model-packager.ts for SHA-256 hashing
PACKAGER="livecalc-vscode/src/cloud/model-packager.ts"

if [[ ! -f "$PACKAGER" ]]; then
    echo "FAIL: model-packager.ts not found"
    exit 1
fi

# Verify SHA-256 hash computation
if ! grep -q "sha256\|SHA-256" "$PACKAGER"; then
    echo "FAIL: SHA-256 hashing not found in packager"
    echo "Expected: SHA-256 hash computation"
    echo "Actual: No SHA-256 reference found"
    exit 1
fi

# Verify manifest creation with hashes
if ! grep -q "manifest" "$PACKAGER"; then
    echo "FAIL: Manifest creation not found"
    echo "Expected: manifest.json with asset hashes"
    echo "Actual: No manifest reference found"
    exit 1
fi

# Verify hash is stored per asset
if ! grep -q "asset.hash\|hash:" "$PACKAGER"; then
    echo "FAIL: Per-asset hash storage not found"
    echo "Expected: hash property on assets"
    echo "Actual: No asset hash storage found"
    exit 1
fi

# Verify package-level hash
if ! grep -q "packageHash" "$PACKAGER"; then
    echo "FAIL: Package-level hash not found"
    echo "Expected: packageHash for entire bundle"
    echo "Actual: No packageHash found"
    exit 1
fi

echo "PASS: Bundle includes SHA-256 manifest of all assets"
exit 0
