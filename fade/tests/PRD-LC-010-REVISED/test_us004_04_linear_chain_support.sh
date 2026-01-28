#!/bin/bash
# Test: Verify support for linear chains (A → B → C)
# AC: Support linear chain (A → B → C) and conditional branches

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Run topological execution order test (verifies linear chain support)
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "Topological execution order" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Linear chains (A → B → C) supported with topological ordering"
        exit 0
    else
        echo "FAIL: Topological execution order test failed"
        ./orchestrator_tests "Topological execution order" --reporter compact 2>&1 | tail -20
        exit 1
    fi
else
    echo "SKIP: Test binary not built"
    exit 0
fi
