#!/bin/bash
# Test: US-001 AC-01 - Extension created using yo code generator (TypeScript)
# AC: Extension created using yo code generator (TypeScript)
# This test verifies the extension has standard VS Code extension TypeScript structure

VSCODE_EXT_DIR="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode"

# Check for TypeScript configuration
if [[ ! -f "$VSCODE_EXT_DIR/tsconfig.json" ]]; then
    echo "FAIL: Expected tsconfig.json to exist"
    echo "Expected: TypeScript config file exists"
    echo "Actual: tsconfig.json not found"
    exit 1
fi

# Check for package.json
if [[ ! -f "$VSCODE_EXT_DIR/package.json" ]]; then
    echo "FAIL: Expected package.json to exist"
    echo "Expected: package.json file exists"
    echo "Actual: package.json not found"
    exit 1
fi

# Check for src/extension.ts entry point
if [[ ! -f "$VSCODE_EXT_DIR/src/extension.ts" ]]; then
    echo "FAIL: Expected src/extension.ts to exist"
    echo "Expected: TypeScript entry point exists"
    echo "Actual: src/extension.ts not found"
    exit 1
fi

# Check for TypeScript devDependency
if ! grep -q '"typescript"' "$VSCODE_EXT_DIR/package.json"; then
    echo "FAIL: Expected typescript devDependency"
    echo "Expected: typescript in devDependencies"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Extension has TypeScript scaffold structure"
exit 0
