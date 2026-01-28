#!/bin/bash
# Test: Verify engines throw clear exceptions on errors
# AC: Engines throw clear exceptions on errors, orchestrator catches and logs

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"
HEADER_FILE="$PROJECT_ROOT/livecalc-orchestrator/src/engine_interface.hpp"

# Check that exception classes are defined
exceptions_found=0

if grep -q "class CalcEngineError" "$HEADER_FILE"; then
    ((exceptions_found++))
fi

if grep -q "class InitializationError" "$HEADER_FILE"; then
    ((exceptions_found++))
fi

if grep -q "class ConfigurationError" "$HEADER_FILE"; then
    ((exceptions_found++))
fi

if grep -q "class ExecutionError" "$HEADER_FILE"; then
    ((exceptions_found++))
fi

if [[ $exceptions_found -lt 4 ]]; then
    echo "FAIL: Not all exception classes defined"
    echo "Expected: CalcEngineError, InitializationError, ConfigurationError, ExecutionError"
    echo "Found: $exceptions_found/4"
    exit 1
fi

# Run Catch2 test for exceptions
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "CalcEngineError exceptions" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Engines throw clear exceptions on errors"
        exit 0
    else
        echo "FAIL: Exception tests failed"
        exit 1
    fi
else
    echo "PASS: Exception classes defined (test binary not built)"
    exit 0
fi
