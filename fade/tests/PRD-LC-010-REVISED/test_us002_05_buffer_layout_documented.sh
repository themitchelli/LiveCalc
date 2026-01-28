#!/bin/bash
# Test: Verify buffer layout is documented with struct definitions, byte offsets, alignment
# AC: Buffer layout documented: struct definitions, byte offsets, alignment

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
HEADER_FILE="$PROJECT_ROOT/livecalc-orchestrator/src/buffer_manager.hpp"

# Check that buffer structs have size and alignment static asserts
if ! grep -q "static_assert(sizeof(InputBufferRecord) == 32" "$HEADER_FILE"; then
    echo "FAIL: InputBufferRecord size not documented/verified"
    exit 1
fi

if ! grep -q "static_assert(sizeof(ScenarioBufferRecord) == 16" "$HEADER_FILE"; then
    echo "FAIL: ScenarioBufferRecord size not documented/verified"
    exit 1
fi

if ! grep -q "static_assert(sizeof(ResultBufferRecord) == 32" "$HEADER_FILE"; then
    echo "FAIL: ResultBufferRecord size not documented/verified"
    exit 1
fi

# Check alignment assertions
if ! grep -q "alignof(InputBufferRecord) == 16" "$HEADER_FILE"; then
    echo "FAIL: InputBufferRecord alignment not documented"
    exit 1
fi

if ! grep -q "alignof(ScenarioBufferRecord) == 16" "$HEADER_FILE"; then
    echo "FAIL: ScenarioBufferRecord alignment not documented"
    exit 1
fi

if ! grep -q "alignof(ResultBufferRecord) == 16" "$HEADER_FILE"; then
    echo "FAIL: ResultBufferRecord alignment not documented"
    exit 1
fi

# Check for layout documentation comments
if ! grep -q "Layout.*bytes" "$HEADER_FILE"; then
    echo "FAIL: Buffer layout not documented in comments"
    exit 1
fi

echo "PASS: Buffer layout documented with struct definitions, byte offsets, alignment"
exit 0
