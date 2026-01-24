#!/bin/bash
# Test: verify works in both Node.js and browser environments
# AC: Works in both Node.js and browser environments

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
CMAKE_FILE="$PROJECT_ROOT/livecalc-engine/CMakeLists.txt"
INDEX_FILE="$PROJECT_ROOT/livecalc-engine/js/src/index.ts"

# Check CMakeLists.txt configures for both web and node
if ! grep -q 'ENVIRONMENT.*web.*node' "$CMAKE_FILE"; then
    echo "FAIL: WASM not configured for both web and node environments"
    echo "Expected: ENVIRONMENT='web,node' in CMakeLists.txt"
    echo "Actual: not found"
    exit 1
fi

# Check package.json has both CommonJS and ESM exports
PACKAGE_JSON="$PROJECT_ROOT/livecalc-engine/js/package.json"

if ! grep -q '"main"' "$PACKAGE_JSON"; then
    echo "FAIL: No CommonJS main entry"
    echo "Expected: main field in package.json for CJS"
    echo "Actual: not found"
    exit 1
fi

if ! grep -q '"module"' "$PACKAGE_JSON"; then
    echo "FAIL: No ESM module entry"
    echo "Expected: module field in package.json for ESM"
    echo "Actual: not found"
    exit 1
fi

# Check for NodeWorkerPool export (Node.js specific)
if ! grep -q "NodeWorkerPool" "$INDEX_FILE"; then
    echo "FAIL: NodeWorkerPool not exported (Node.js support)"
    echo "Expected: NodeWorkerPool export for Node.js"
    echo "Actual: not found"
    exit 1
fi

# Check for WorkerPool export (browser compatible)
if ! grep -q "WorkerPool" "$INDEX_FILE"; then
    echo "FAIL: WorkerPool not exported (browser support)"
    echo "Expected: WorkerPool export for browser"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Works in both Node.js and browser environments"
exit 0
