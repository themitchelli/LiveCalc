#!/bin/bash
# Test: verify TypeScript type definitions (.d.ts) included
# AC: TypeScript type definitions (.d.ts) included

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
JS_DIR="$PROJECT_ROOT/livecalc-engine/js"
TYPES_FILE="$JS_DIR/src/types.ts"
PACKAGE_JSON="$JS_DIR/package.json"

if [[ ! -f "$TYPES_FILE" ]]; then
    echo "FAIL: types.ts not found"
    echo "Expected: $TYPES_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check package.json declares types
if ! grep -q '"types"' "$PACKAGE_JSON"; then
    echo "FAIL: package.json does not declare types field"
    echo "Expected: types field in package.json"
    echo "Actual: not found"
    exit 1
fi

# Check types field points to .d.ts
if ! grep -q '\.d\.ts' "$PACKAGE_JSON"; then
    echo "FAIL: types field does not point to .d.ts file"
    echo "Expected: types pointing to .d.ts file"
    echo "Actual: not found"
    exit 1
fi

# Check types.ts exports key types
KEY_TYPES=(
    "Policy"
    "ValuationResult"
    "ValuationConfig"
    "ScenarioParams"
)

for type in "${KEY_TYPES[@]}"; do
    if ! grep -q "export.*$type" "$TYPES_FILE"; then
        echo "FAIL: Type $type not exported from types.ts"
        echo "Expected: export of $type"
        echo "Actual: not found"
        exit 1
    fi
done

echo "PASS: TypeScript type definitions included"
exit 0
