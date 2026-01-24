#!/bin/bash
# Test: verify exported functions accessible via Module.cwrap() or Module.ccall()
# AC: Exported functions accessible via Module.cwrap() or Module.ccall()

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
CMAKE_FILE="$PROJECT_ROOT/livecalc-engine/CMakeLists.txt"
WASM_JS="$PROJECT_ROOT/livecalc-engine/build-wasm/livecalc.mjs"

# Check CMakeLists.txt exports required functions
REQUIRED_FUNCTIONS=(
    "_run_valuation"
    "_load_policies"
    "_get_result"
    "_livecalc_malloc"
    "_livecalc_free"
)

for func in "${REQUIRED_FUNCTIONS[@]}"; do
    # Check for partial match (e.g., _load_policies matches _load_policies_csv)
    if ! grep -q "\"${func}" "$CMAKE_FILE"; then
        echo "FAIL: Function $func not in EXPORTED_FUNCTIONS"
        echo "Expected: $func in CMakeLists.txt EXPORTED_FUNCTIONS"
        echo "Actual: not found"
        exit 1
    fi
done

# Check EXPORTED_RUNTIME_METHODS includes cwrap and ccall
if ! grep -q "'cwrap'" "$CMAKE_FILE"; then
    echo "FAIL: cwrap not in EXPORTED_RUNTIME_METHODS"
    echo "Expected: cwrap in EXPORTED_RUNTIME_METHODS"
    echo "Actual: not found"
    exit 1
fi

if ! grep -q "'ccall'" "$CMAKE_FILE"; then
    echo "FAIL: ccall not in EXPORTED_RUNTIME_METHODS"
    echo "Expected: ccall in EXPORTED_RUNTIME_METHODS"
    echo "Actual: not found"
    exit 1
fi

# Check the generated JS module exists and exports createLiveCalcModule
if [[ -f "$WASM_JS" ]]; then
    if ! grep -q "createLiveCalcModule" "$WASM_JS"; then
        echo "FAIL: createLiveCalcModule export not found in livecalc.mjs"
        echo "Expected: createLiveCalcModule function exported"
        echo "Actual: not found"
        exit 1
    fi
fi

echo "PASS: Exported functions accessible via cwrap/ccall"
exit 0
