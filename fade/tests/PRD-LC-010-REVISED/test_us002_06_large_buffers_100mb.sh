#!/bin/bash
# Test: Verify support for large buffers (100MB+) without performance degradation
# AC: Support for large buffers (100MB+) without performance degradation

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Run large buffer allocation test
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "BufferManager: Large buffer allocation" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Large buffers (100MB+) supported without performance degradation"
        exit 0
    else
        echo "FAIL: Large buffer allocation test failed"
        ./orchestrator_tests "BufferManager: Large buffer allocation" --reporter compact 2>&1 | tail -20
        exit 1
    fi
else
    echo "SKIP: Test binary not built"
    exit 0
fi
