#!/bin/bash
# Test: verify memory limits configurable for server environments
# AC: Memory limits configurable for server environments

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
TYPES_FILE="$PROJECT_ROOT/livecalc-engine/js/src/types.ts"
CMAKE_FILE="$PROJECT_ROOT/livecalc-engine/CMakeLists.txt"

if [[ ! -f "$TYPES_FILE" ]]; then
    echo "FAIL: types.ts not found"
    echo "Expected: $TYPES_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for MemoryConfig interface
if ! grep -q "interface MemoryConfig\|MemoryConfig" "$TYPES_FILE"; then
    echo "FAIL: MemoryConfig interface not found"
    echo "Expected: MemoryConfig interface for server memory limits"
    echo "Actual: not found"
    exit 1
fi

# Check for memory configuration options
if ! grep -qE "maxMemory|initialMemory|MAXIMUM_MEMORY" "$TYPES_FILE"; then
    echo "FAIL: Memory configuration options not found in types"
    echo "Expected: maxMemory/initialMemory options"
    echo "Actual: not found"
    exit 1
fi

# Check CMake has memory configuration
if ! grep -q "MAXIMUM_MEMORY\|INITIAL_MEMORY" "$CMAKE_FILE"; then
    echo "FAIL: Memory configuration not in CMakeLists.txt"
    echo "Expected: MAXIMUM_MEMORY/INITIAL_MEMORY in WASM config"
    echo "Actual: not found"
    exit 1
fi

# Check for memory presets (small, large)
if ! grep -qE "MEMORY_CONFIG_SMALL|MEMORY_CONFIG_LARGE" "$TYPES_FILE"; then
    echo "FAIL: Memory configuration presets not found"
    echo "Expected: MEMORY_CONFIG_SMALL/LARGE presets"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Memory limits configurable for server environments"
exit 0
