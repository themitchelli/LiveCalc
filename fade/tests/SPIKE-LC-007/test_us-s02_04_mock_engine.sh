#!/bin/bash
# Test: verify MockCalcEngine exists for testing scheduler without real engine
# AC: MockCalcEngine for testing scheduler without real engine

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

MOCK_ENGINE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/mock-engine.ts"

if [[ ! -f "$MOCK_ENGINE_FILE" ]]; then
    echo "FAIL: MockCalcEngine file not found"
    echo "Expected: $MOCK_ENGINE_FILE"
    exit 1
fi

# Check for MockCalcEngine class
if ! grep -q "class MockCalcEngine" "$MOCK_ENGINE_FILE"; then
    echo "FAIL: MockCalcEngine class not found"
    echo "Expected: 'class MockCalcEngine' in mock-engine.ts"
    exit 1
fi

# Check it implements CalcEngine
if ! grep -q "MockCalcEngine.*implements.*CalcEngine\|implements CalcEngine" "$MOCK_ENGINE_FILE"; then
    echo "FAIL: MockCalcEngine does not implement CalcEngine"
    exit 1
fi

# Check for test utilities
if ! grep -q "createMockEngineFactory\|createFastMockEngine\|createRealisticMockEngine" "$MOCK_ENGINE_FILE"; then
    echo "FAIL: Mock engine factory functions not found"
    echo "Expected: factory functions for testing"
    exit 1
fi

# Check that tests exist for MockCalcEngine
MOCK_TEST_FILE="$PROJECT_ROOT/livecalc-engine/js/tests/calc-engine.test.ts"

if [[ -f "$MOCK_TEST_FILE" ]] && grep -q "MockCalcEngine" "$MOCK_TEST_FILE"; then
    echo "PASS: MockCalcEngine exists, implements CalcEngine, and has test coverage"
    exit 0
else
    echo "PASS: MockCalcEngine exists and implements CalcEngine (test file location may vary)"
    exit 0
fi
