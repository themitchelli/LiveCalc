#!/bin/bash
# Test: verify benchmark compares SIMD vs non-SIMD builds
# AC: Benchmark compares SIMD vs non-SIMD builds

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Check for SIMD comparison benchmark script
COMPARE_SIMD="$PROJECT_ROOT/livecalc-engine/benchmarks/compare-simd.ts"

if [[ ! -f "$COMPARE_SIMD" ]]; then
    echo "FAIL: SIMD comparison benchmark not found"
    echo "Expected: $COMPARE_SIMD"
    exit 1
fi

# Verify script compares both builds
if ! grep -q "simd\|SIMD" "$COMPARE_SIMD"; then
    echo "FAIL: compare-simd.ts doesn't reference SIMD"
    exit 1
fi

# Check for both module references
if ! grep -q "livecalc-simd\|simdModule\|scalar\|non-simd" "$COMPARE_SIMD"; then
    echo "FAIL: compare-simd.ts doesn't compare SIMD and scalar builds"
    exit 1
fi

echo "PASS: SIMD vs non-SIMD benchmark comparison tool exists"
exit 0
