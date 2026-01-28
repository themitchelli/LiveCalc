#!/bin/bash
# Test: Verify error recovery cleans up resources and returns error to caller
# AC: Error recovery: if engine fails, cleanup resources, return error to caller

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Run lifecycle error recovery tests
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"

    # Test execution failure handling
    result1=$(./orchestrator_tests "Lifecycle: Execution failure" --reporter compact 2>&1)
    if ! echo "$result1" | grep -q "passed"; then
        echo "FAIL: Execution failure test failed"
        exit 1
    fi

    # Test initialization failure handling
    result2=$(./orchestrator_tests "Lifecycle: Initialization failure" --reporter compact 2>&1)
    if ! echo "$result2" | grep -q "passed"; then
        echo "FAIL: Initialization failure test failed"
        exit 1
    fi

    echo "PASS: Error recovery cleans up resources and returns error to caller"
    exit 0
else
    echo "SKIP: Test binary not built"
    exit 0
fi
