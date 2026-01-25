#!/bin/bash
# Test: Utility creates a bundle containing required model files
# AC: Utility creates a .zip or .tar bundle containing: livecalc.config.json, all .wasm binaries, .py scripts, and assumption metadata.
# US: US-BRIDGE-02 (Model Asset Packaging)

set -e

# Check that model-packager.ts exists and handles required file types
PACKAGER="livecalc-vscode/src/cloud/model-packager.ts"

if [[ ! -f "$PACKAGER" ]]; then
    echo "FAIL: model-packager.ts not found at $PACKAGER"
    echo "Expected: File exists"
    echo "Actual: File not found"
    exit 1
fi

# Verify it handles config file
if ! grep -q "livecalc.config.json" "$PACKAGER"; then
    echo "FAIL: Packager does not handle livecalc.config.json"
    echo "Expected: livecalc.config.json packaging"
    echo "Actual: No config file handling found"
    exit 1
fi

# Verify it handles WASM binaries
if ! grep -q "\.wasm" "$PACKAGER"; then
    echo "FAIL: Packager does not handle .wasm files"
    echo "Expected: .wasm binary packaging"
    echo "Actual: No WASM handling found"
    exit 1
fi

# Verify it handles Python scripts
if ! grep -q "\.py" "$PACKAGER"; then
    echo "FAIL: Packager does not handle .py files"
    echo "Expected: .py script packaging"
    echo "Actual: No Python script handling found"
    exit 1
fi

# Verify it handles assumptions
if ! grep -q "assumption" "$PACKAGER"; then
    echo "FAIL: Packager does not handle assumption files"
    echo "Expected: assumption metadata packaging"
    echo "Actual: No assumption handling found"
    exit 1
fi

# Verify it creates a zip bundle
if ! grep -q "JSZip\|\.zip" "$PACKAGER"; then
    echo "FAIL: Packager does not create zip bundles"
    echo "Expected: JSZip or .zip bundle creation"
    echo "Actual: No zip creation found"
    exit 1
fi

echo "PASS: Utility creates a bundle containing required model files"
exit 0
