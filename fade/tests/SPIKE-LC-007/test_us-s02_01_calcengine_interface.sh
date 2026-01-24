#!/bin/bash
# Test: verify CalcEngine TypeScript interface defined with runChunk() method
# AC: CalcEngine TypeScript interface defined with runChunk() method

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

CALC_ENGINE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/calc-engine.ts"

if [[ ! -f "$CALC_ENGINE_FILE" ]]; then
    echo "FAIL: CalcEngine interface file not found"
    echo "Expected: $CALC_ENGINE_FILE"
    exit 1
fi

# Check for interface definition
if ! grep -q "export interface CalcEngine" "$CALC_ENGINE_FILE"; then
    echo "FAIL: CalcEngine interface not exported"
    echo "Expected: 'export interface CalcEngine' in calc-engine.ts"
    exit 1
fi

# Check for runChunk method in interface
if ! grep -q "runChunk.*ChunkConfig.*Promise.*ChunkResult" "$CALC_ENGINE_FILE"; then
    echo "FAIL: runChunk method not found in CalcEngine interface"
    echo "Expected: runChunk method with ChunkConfig parameter and Promise<ChunkResult> return"
    exit 1
fi

# Check for initialize method
if ! grep -q "initialize.*Promise.*void" "$CALC_ENGINE_FILE"; then
    echo "FAIL: initialize method not found in CalcEngine interface"
    echo "Expected: initialize(): Promise<void>"
    exit 1
fi

# Check for dispose method
if ! grep -q "dispose.*void" "$CALC_ENGINE_FILE"; then
    echo "FAIL: dispose method not found in CalcEngine interface"
    echo "Expected: dispose(): void"
    exit 1
fi

echo "PASS: CalcEngine interface defined with required methods (initialize, runChunk, dispose)"
exit 0
