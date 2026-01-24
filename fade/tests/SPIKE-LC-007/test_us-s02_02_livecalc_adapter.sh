#!/bin/bash
# Test: verify LiveCalc WASM engine implements the CalcEngine interface
# AC: Current LiveCalc WASM engine implements the interface

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

ADAPTER_FILE="$PROJECT_ROOT/livecalc-engine/js/src/livecalc-adapter.ts"

if [[ ! -f "$ADAPTER_FILE" ]]; then
    echo "FAIL: LiveCalc adapter file not found"
    echo "Expected: $ADAPTER_FILE"
    exit 1
fi

# Check that adapter implements CalcEngine
if ! grep -q "class LiveCalcEngineAdapter implements CalcEngine" "$ADAPTER_FILE"; then
    echo "FAIL: LiveCalcEngineAdapter does not implement CalcEngine"
    echo "Expected: 'class LiveCalcEngineAdapter implements CalcEngine'"
    exit 1
fi

# Check for required method implementations
REQUIRED_METHODS="initialize runChunk dispose loadPolicies loadAssumptions getInfo"

for method in $REQUIRED_METHODS; do
    if ! grep -q "${method}(" "$ADAPTER_FILE"; then
        echo "FAIL: Method '$method' not found in LiveCalcEngineAdapter"
        exit 1
    fi
done

# Check it imports the CalcEngine interface
HAS_IMPORT=$(grep -c "CalcEngine" "$ADAPTER_FILE" || true)
HAS_FILE=$(grep -c "calc-engine" "$ADAPTER_FILE" || true)

if [[ "$HAS_IMPORT" -eq 0 ]] || [[ "$HAS_FILE" -eq 0 ]]; then
    echo "FAIL: LiveCalcEngineAdapter does not import CalcEngine interface"
    exit 1
fi

echo "PASS: LiveCalcEngineAdapter implements CalcEngine interface with all required methods"
exit 0
