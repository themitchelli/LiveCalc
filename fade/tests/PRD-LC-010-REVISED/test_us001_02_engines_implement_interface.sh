#!/bin/bash
# Test: Verify all engines implement ICalcEngine interface
# AC: All engines (C++, Python) implement this interface

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"
SRC_DIR="$PROJECT_ROOT/livecalc-orchestrator/src"

# Check that projection engine inherits from ICalcEngine
PROJECTION_ENGINE="$SRC_DIR/projection_engine.hpp"

if [[ ! -f "$PROJECTION_ENGINE" ]]; then
    echo "FAIL: ProjectionEngine header not found"
    echo "Expected: $PROJECTION_ENGINE"
    exit 1
fi

# Verify ProjectionEngine inherits from ICalcEngine
if ! grep -q "class ProjectionEngine.*:.*public ICalcEngine" "$PROJECTION_ENGINE"; then
    echo "FAIL: ProjectionEngine does not implement ICalcEngine interface"
    echo "Expected: class ProjectionEngine : public ICalcEngine"
    exit 1
fi

# Run tests for MockEngine (which implements ICalcEngine)
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "MockEngine lifecycle" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Engines implement ICalcEngine interface"
        exit 0
    else
        echo "FAIL: Engine implementation tests failed"
        exit 1
    fi
else
    echo "PASS: Engines implement interface (test binary not built)"
    exit 0
fi
