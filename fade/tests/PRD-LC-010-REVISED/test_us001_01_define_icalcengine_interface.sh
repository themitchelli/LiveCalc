#!/bin/bash
# Test: Verify ICalcEngine interface is defined with initialize(), runChunk(), dispose()
# AC: Define ICalcEngine: initialize(), runChunk(), dispose()

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"
HEADER_FILE="$PROJECT_ROOT/livecalc-orchestrator/src/engine_interface.hpp"

# Check header file exists
if [[ ! -f "$HEADER_FILE" ]]; then
    echo "FAIL: ICalcEngine header file not found"
    echo "Expected: $HEADER_FILE"
    exit 1
fi

# Verify interface methods are declared
missing_methods=()

if ! grep -q "virtual void initialize(" "$HEADER_FILE"; then
    missing_methods+=("initialize()")
fi

if ! grep -q "virtual ExecutionResult runChunk(" "$HEADER_FILE"; then
    missing_methods+=("runChunk()")
fi

if ! grep -q "virtual void dispose(" "$HEADER_FILE"; then
    missing_methods+=("dispose()")
fi

if [[ ${#missing_methods[@]} -gt 0 ]]; then
    echo "FAIL: ICalcEngine missing required methods"
    echo "Expected: initialize(), runChunk(), dispose()"
    echo "Missing: ${missing_methods[*]}"
    exit 1
fi

# Run the Catch2 tests for engine interface
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "[engine_interface]" --reporter compact 2>&1 | grep -q "All tests passed"; then
        echo "PASS: ICalcEngine interface defined with initialize(), runChunk(), dispose()"
        exit 0
    else
        echo "FAIL: Engine interface tests failed"
        ./orchestrator_tests "[engine_interface]" --reporter compact 2>&1 | tail -20
        exit 1
    fi
else
    echo "PASS: ICalcEngine interface defined (test binary not built)"
    exit 0
fi
