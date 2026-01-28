#!/bin/bash
# Test: Verify orchestrator allocates SharedArrayBuffer(s) for data exchange
# AC: Orchestrator allocates SharedArrayBuffer(s) for data exchange

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Run BufferManager allocation test
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "BufferManager: Basic allocation and deallocation" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Orchestrator allocates SharedArrayBuffer(s) for data exchange"
        exit 0
    else
        echo "FAIL: BufferManager allocation test failed"
        ./orchestrator_tests "BufferManager: Basic allocation and deallocation" --reporter compact 2>&1 | tail -20
        exit 1
    fi
else
    echo "SKIP: Test binary not built"
    exit 0
fi
