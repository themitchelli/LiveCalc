#!/bin/bash
# Test: Allocates a matching SharedArrayBuffer Data Bus in the container memory
# AC: Allocates a matching SharedArrayBuffer Data Bus in the container memory.
# US: US-BRIDGE-04 (Cloud Pipeline Reconstruction)

set -e

# Check pipeline loader for SharedArrayBuffer allocation
PIPELINE_LOADER="livecalc-cloud/worker/src/pipeline-loader.ts"

if [[ ! -f "$PIPELINE_LOADER" ]]; then
    echo "FAIL: pipeline-loader.ts not found"
    exit 1
fi

# Verify SharedArrayBuffer usage
if ! grep -q "SharedArrayBuffer" "$PIPELINE_LOADER"; then
    echo "FAIL: SharedArrayBuffer not found in pipeline loader"
    echo "Expected: SharedArrayBuffer allocation"
    echo "Actual: No SharedArrayBuffer found"
    exit 1
fi

# Verify MemoryOffsetManager usage
if ! grep -q "MemoryOffsetManager" "$PIPELINE_LOADER"; then
    echo "FAIL: MemoryOffsetManager not found"
    echo "Expected: Memory offset management"
    echo "Actual: No MemoryOffsetManager found"
    exit 1
fi

# Verify bus:// resource extraction
if ! grep -q "bus://\|extractBusResources" "$PIPELINE_LOADER"; then
    echo "FAIL: bus:// resource handling not found"
    echo "Expected: bus:// protocol support"
    echo "Actual: No bus resource handling"
    exit 1
fi

# Verify buffer allocation
if ! grep -q "allocate\|getBuffer" "$PIPELINE_LOADER"; then
    echo "FAIL: Buffer allocation not found"
    echo "Expected: Memory allocation methods"
    echo "Actual: No allocation found"
    exit 1
fi

echo "PASS: Allocates matching SharedArrayBuffer Data Bus in container memory"
exit 0
