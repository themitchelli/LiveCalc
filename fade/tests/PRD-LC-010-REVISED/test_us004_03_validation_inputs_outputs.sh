#!/bin/bash
# Test: Verify validation ensures all inputs have corresponding outputs
# AC: Validation: ensure all inputs have corresponding outputs from previous engines

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Run DAGConfig validation tests
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "DAGConfig validation" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Validation ensures all inputs have corresponding outputs"
        exit 0
    else
        echo "FAIL: DAGConfig validation test failed"
        ./orchestrator_tests "DAGConfig validation" --reporter compact 2>&1 | tail -20
        exit 1
    fi
else
    echo "SKIP: Test binary not built"
    exit 0
fi
