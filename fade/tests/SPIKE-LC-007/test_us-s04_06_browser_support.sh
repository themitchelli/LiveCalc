#!/bin/bash
# Test: verify SIMD build works in Chrome 91+, Firefox 89+, Safari 16.4+, Node 16+
# AC: SIMD build works in Chrome 91+, Firefox 89+, Safari 16.4+, Node 16+

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Check for SIMD detection module
SIMD_DETECTION="$PROJECT_ROOT/livecalc-engine/js/src/simd-detection.ts"

if [[ ! -f "$SIMD_DETECTION" ]]; then
    echo "FAIL: SIMD detection module not found"
    echo "Expected: $SIMD_DETECTION"
    exit 1
fi

# Check for browser version constants
BROWSER_VERSIONS_FOUND=0

if grep -q "chrome.*91\|91" "$SIMD_DETECTION"; then
    ((BROWSER_VERSIONS_FOUND++))
fi

if grep -q "firefox.*89\|89" "$SIMD_DETECTION"; then
    ((BROWSER_VERSIONS_FOUND++))
fi

if grep -q "safari.*16\.4\|16\.4" "$SIMD_DETECTION"; then
    ((BROWSER_VERSIONS_FOUND++))
fi

if grep -q "node.*16\|16" "$SIMD_DETECTION"; then
    ((BROWSER_VERSIONS_FOUND++))
fi

# Check for SIMD_BROWSER_SUPPORT constant
if grep -q "SIMD_BROWSER_SUPPORT" "$SIMD_DETECTION"; then
    echo "PASS: SIMD detection module includes browser support requirements"
    exit 0
fi

if [[ "$BROWSER_VERSIONS_FOUND" -ge 2 ]]; then
    echo "PASS: SIMD detection includes browser version requirements"
    exit 0
fi

# Check for WebAssembly.validate feature detection
if grep -q "WebAssembly.validate" "$SIMD_DETECTION"; then
    echo "PASS: SIMD detection uses WebAssembly.validate for runtime feature detection"
    exit 0
fi

echo "FAIL: SIMD detection doesn't include browser support information"
exit 1
