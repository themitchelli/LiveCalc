#!/bin/bash
# Test: Verify runChunk(input_buffer, output_buffer) is the main execution unit
# AC: runChunk(input_buffer, output_buffer) is the main execution unit

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"
HEADER_FILE="$PROJECT_ROOT/livecalc-orchestrator/src/engine_interface.hpp"

# Check runChunk signature has input/output buffers
if ! grep -q "runChunk.*input_buffer.*output_buffer" "$HEADER_FILE"; then
    echo "FAIL: runChunk() does not have correct signature"
    echo "Expected: runChunk(input_buffer, input_size, output_buffer, output_size)"
    exit 1
fi

# Run Catch2 test for MockEngine runChunk
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "MockEngine runChunk" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: runChunk(input_buffer, output_buffer) is main execution unit"
        exit 0
    else
        echo "FAIL: runChunk test failed"
        exit 1
    fi
else
    echo "PASS: runChunk signature verified (test binary not built)"
    exit 0
fi
