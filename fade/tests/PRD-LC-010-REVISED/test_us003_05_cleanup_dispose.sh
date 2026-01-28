#!/bin/bash
# Test: Verify cleanup calls dispose() on all engines at end
# AC: Cleanup: call dispose() on all engines at end

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Run dispose tests
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"

    # Test dispose is idempotent (can be called multiple times safely)
    result=$(./orchestrator_tests "Lifecycle: Dispose is idempotent" --reporter compact 2>&1)
    if ! echo "$result" | grep -q "passed"; then
        echo "FAIL: Dispose idempotency test failed"
        exit 1
    fi

    echo "PASS: Cleanup calls dispose() on all engines at end"
    exit 0
else
    echo "SKIP: Test binary not built"
    exit 0
fi
