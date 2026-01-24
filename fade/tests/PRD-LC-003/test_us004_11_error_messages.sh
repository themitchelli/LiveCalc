#!/bin/bash
# Test: US-004 AC-11 - Engine errors surfaced with meaningful messages
# AC: Engine errors surfaced with meaningful messages

ENGINE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/engine/livecalc-engine.ts"

if [[ ! -f "$ENGINE_FILE" ]]; then
    echo "FAIL: Engine file not found"
    exit 1
fi

# Check for EngineError class
if ! grep -q 'class EngineError\|EngineError extends' "$ENGINE_FILE"; then
    echo "FAIL: No EngineError class"
    echo "Expected: EngineError class definition"
    echo "Actual: not found"
    exit 1
fi

# Check for error codes
if ! grep -q 'code:' "$ENGINE_FILE"; then
    echo "FAIL: No error codes in EngineError"
    echo "Expected: error codes for classification"
    echo "Actual: not found"
    exit 1
fi

# Check for meaningful error messages (EngineError with string message)
if ! grep -q "EngineError(" "$ENGINE_FILE"; then
    echo "FAIL: No EngineError instantiations"
    echo "Expected: EngineError instantiations with messages"
    echo "Actual: not found"
    exit 1
fi

# Check for specific error types (CANCELLED, INIT_FAILED, etc.)
if ! grep -q 'CANCELLED\|INIT_FAILED\|VALUATION_FAILED' "$ENGINE_FILE"; then
    echo "FAIL: No specific error codes"
    echo "Expected: specific error codes like CANCELLED"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Engine has meaningful error messages"
exit 0
