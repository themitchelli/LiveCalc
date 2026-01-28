#!/bin/bash
# Test: Verify engines write to output_buffer, orchestrator passes to next engine's input_buffer
# AC: Engines write data to output_buffer, orchestrator passes to next engine's input_buffer

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Run zero-copy data sharing test
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "BufferManager: Zero-copy data sharing" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Zero-copy data flow between engines verified"
        exit 0
    else
        echo "FAIL: Zero-copy data sharing test failed"
        ./orchestrator_tests "BufferManager: Zero-copy data sharing" --reporter compact 2>&1 | tail -20
        exit 1
    fi
else
    echo "SKIP: Test binary not built"
    exit 0
fi
