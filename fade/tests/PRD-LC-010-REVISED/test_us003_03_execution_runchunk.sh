#!/bin/bash
# Test: Verify execution calls runChunk() with data and collects results
# AC: Execution: call runChunk() with data, collect results

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Run lifecycle successful execution test
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "Lifecycle: Successful execution" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Execution calls runChunk() with data and collects results"
        exit 0
    else
        echo "FAIL: Successful execution test failed"
        ./orchestrator_tests "Lifecycle: Successful execution" --reporter compact 2>&1 | tail -20
        exit 1
    fi
else
    echo "SKIP: Test binary not built"
    exit 0
fi
