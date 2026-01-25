#!/bin/bash
# Test: Dockerfile builds a Debian-based image with Emscripten and Pyodide runtimes
# AC: Dockerfile builds a Debian-based image with Emscripten and Pyodide runtimes.
# US: US-BRIDGE-01 (Cloud Worker Container - Parity Runtime)

set -e

# Check that Dockerfile.worker exists
DOCKERFILE="livecalc-cloud/Dockerfile.worker"

if [[ ! -f "$DOCKERFILE" ]]; then
    echo "FAIL: Dockerfile.worker not found at $DOCKERFILE"
    echo "Expected: File exists"
    echo "Actual: File not found"
    exit 1
fi

# Verify it's Debian-based
if ! grep -q "FROM debian:" "$DOCKERFILE"; then
    echo "FAIL: Dockerfile is not Debian-based"
    echo "Expected: FROM debian:* base image"
    echo "Actual: $(grep '^FROM' "$DOCKERFILE" | head -1)"
    exit 1
fi

# Verify Emscripten SDK installation
if ! grep -q "emsdk" "$DOCKERFILE"; then
    echo "FAIL: Emscripten SDK not found in Dockerfile"
    echo "Expected: emsdk installation"
    echo "Actual: No emsdk reference found"
    exit 1
fi

# Verify Pyodide installation
if ! grep -q "pyodide" "$DOCKERFILE"; then
    echo "FAIL: Pyodide not found in Dockerfile"
    echo "Expected: pyodide installation"
    echo "Actual: No pyodide reference found"
    exit 1
fi

echo "PASS: Dockerfile is Debian-based with Emscripten and Pyodide runtimes"
exit 0
