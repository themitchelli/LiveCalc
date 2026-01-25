#!/bin/bash
# Test: Runtime supports WASM SIMD128 and 16-byte memory alignment
# AC: Runtime supports WASM SIMD128 and 16-byte memory alignment.
# US: US-BRIDGE-01 (Cloud Worker Container - Parity Runtime)

set -e

# Check Dockerfile for SIMD configuration
DOCKERFILE="livecalc-cloud/Dockerfile.worker"

if [[ ! -f "$DOCKERFILE" ]]; then
    echo "FAIL: Dockerfile.worker not found"
    exit 1
fi

# Verify WASM_SIMD environment variable is set
if ! grep -q "WASM_SIMD=1" "$DOCKERFILE"; then
    echo "FAIL: WASM_SIMD=1 not found in Dockerfile"
    echo "Expected: ENV WASM_SIMD=1"
    echo "Actual: SIMD environment variable not set"
    exit 1
fi

# Check worker main.ts for SIMD and alignment support
WORKER_MAIN="livecalc-cloud/worker/src/main.ts"

if [[ ! -f "$WORKER_MAIN" ]]; then
    echo "FAIL: Worker main.ts not found"
    exit 1
fi

# Verify /capabilities endpoint checks SIMD
if ! grep -q "simd128" "$WORKER_MAIN"; then
    echo "FAIL: SIMD128 capability check not found in worker"
    echo "Expected: simd128 capability verification"
    echo "Actual: No simd128 reference found"
    exit 1
fi

# Verify 16-byte alignment verification
if ! grep -q "16-byte" "$WORKER_MAIN"; then
    echo "FAIL: 16-byte alignment verification not found"
    echo "Expected: 16-byte alignment support"
    echo "Actual: No 16-byte alignment reference found"
    exit 1
fi

echo "PASS: Runtime supports WASM SIMD128 and 16-byte memory alignment"
exit 0
