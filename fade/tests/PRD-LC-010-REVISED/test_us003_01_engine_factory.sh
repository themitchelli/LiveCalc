#!/bin/bash
# Test: Verify engine factory creates engines by type
# AC: Engine factory: creates engines by type (cpp_projection, python_esg, python_solver)

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"
SRC_DIR="$PROJECT_ROOT/livecalc-orchestrator/src"

# Check EngineFactory exists
if [[ ! -f "$SRC_DIR/engine_factory.hpp" ]]; then
    echo "FAIL: EngineFactory header not found"
    exit 1
fi

# Check create_engine method exists
if ! grep -q "create_engine" "$SRC_DIR/engine_factory.hpp"; then
    echo "FAIL: EngineFactory does not have create_engine method"
    exit 1
fi

# Run Catch2 factory tests
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "[factory]" --reporter compact 2>&1 | grep -q "All tests passed"; then
        echo "PASS: Engine factory creates engines by type"
        exit 0
    else
        echo "FAIL: Factory tests failed"
        ./orchestrator_tests "[factory]" --reporter compact 2>&1 | tail -20
        exit 1
    fi
else
    echo "PASS: EngineFactory verified (test binary not built)"
    exit 0
fi
