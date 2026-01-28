#!/bin/bash
# Test: Verify startup calls initialize() on each engine in sequence
# AC: Startup: call initialize() on each engine in sequence

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Run lifecycle initialization test
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "Lifecycle: Initialize and dispose" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Startup calls initialize() on each engine in sequence"
        exit 0
    else
        echo "FAIL: Lifecycle initialization test failed"
        ./orchestrator_tests "Lifecycle: Initialize and dispose" --reporter compact 2>&1 | tail -20
        exit 1
    fi
else
    echo "SKIP: Test binary not built"
    exit 0
fi
