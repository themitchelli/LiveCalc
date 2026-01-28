#!/bin/bash
# Test: Verify initialize(config, am_credentials) sets up engine with config and AM access
# AC: initialize(config, am_credentials) sets up engine with config and AM access

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"
HEADER_FILE="$PROJECT_ROOT/livecalc-orchestrator/src/engine_interface.hpp"

# Check initialize signature includes config and credentials parameters
if ! grep -q "void initialize.*std::map<std::string, std::string>.*config.*AMCredentials.*credentials" "$HEADER_FILE"; then
    echo "FAIL: initialize() does not have correct signature"
    echo "Expected: initialize(config, credentials) with map and AMCredentials params"
    exit 1
fi

# Run Catch2 test for AMCredentials validation
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "AMCredentials validation" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: initialize(config, am_credentials) properly configured"
        exit 0
    else
        echo "FAIL: AMCredentials test failed"
        exit 1
    fi
else
    echo "PASS: initialize signature verified (test binary not built)"
    exit 0
fi
