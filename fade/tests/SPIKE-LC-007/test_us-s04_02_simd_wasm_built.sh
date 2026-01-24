#!/bin/bash
# Test: verify build produces livecalc-simd.wasm alongside livecalc.wasm
# AC: Build produces livecalc-simd.wasm alongside livecalc.wasm

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Check for SIMD WASM build
SIMD_WASM="$PROJECT_ROOT/livecalc-engine/build-wasm-simd/livecalc-simd.wasm"
SIMD_MJS="$PROJECT_ROOT/livecalc-engine/build-wasm-simd/livecalc-simd.mjs"

# Check for scalar WASM build
SCALAR_WASM="$PROJECT_ROOT/livecalc-engine/build-wasm/livecalc.wasm"
SCALAR_MJS="$PROJECT_ROOT/livecalc-engine/build-wasm/livecalc.mjs"

ERRORS=""

if [[ ! -f "$SCALAR_WASM" ]]; then
    ERRORS="$ERRORS\n- livecalc.wasm not found at $SCALAR_WASM"
fi

if [[ ! -f "$SCALAR_MJS" ]]; then
    ERRORS="$ERRORS\n- livecalc.mjs not found at $SCALAR_MJS"
fi

if [[ ! -f "$SIMD_WASM" ]]; then
    ERRORS="$ERRORS\n- livecalc-simd.wasm not found at $SIMD_WASM"
fi

if [[ ! -f "$SIMD_MJS" ]]; then
    ERRORS="$ERRORS\n- livecalc-simd.mjs not found at $SIMD_MJS"
fi

if [[ -n "$ERRORS" ]]; then
    echo "FAIL: Missing WASM build artifacts"
    echo -e "Expected files:$ERRORS"
    exit 1
fi

# Both builds should exist and be reasonable size
SCALAR_SIZE=$(stat -f%z "$SCALAR_WASM" 2>/dev/null || stat -c%s "$SCALAR_WASM" 2>/dev/null)
SIMD_SIZE=$(stat -f%z "$SIMD_WASM" 2>/dev/null || stat -c%s "$SIMD_WASM" 2>/dev/null)

if [[ "$SCALAR_SIZE" -lt 10000 ]] || [[ "$SIMD_SIZE" -lt 10000 ]]; then
    echo "FAIL: WASM files seem too small (corrupt?)"
    echo "Scalar: $SCALAR_SIZE bytes, SIMD: $SIMD_SIZE bytes"
    exit 1
fi

echo "PASS: Both livecalc.wasm and livecalc-simd.wasm are built"
echo "  - livecalc.wasm: $SCALAR_SIZE bytes"
echo "  - livecalc-simd.wasm: $SIMD_SIZE bytes"
exit 0
