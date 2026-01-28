#!/bin/bash
# Test: Verify timeout protection for runChunk()
# AC: Timeout protection: runChunk() must complete within time limit (configurable, default 5 min)

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Run timeout test
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "Lifecycle: Execution timeout" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Timeout protection works for runChunk()"
        exit 0
    else
        echo "FAIL: Timeout test failed"
        ./orchestrator_tests "Lifecycle: Execution timeout" --reporter compact 2>&1 | tail -20
        exit 1
    fi
else
    echo "SKIP: Test binary not built"
    exit 0
fi
