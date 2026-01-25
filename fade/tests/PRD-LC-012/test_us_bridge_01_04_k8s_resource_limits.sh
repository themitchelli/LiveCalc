#!/bin/bash
# Test: Resource limits are enforceable via K8s manifest
# AC: Resource limits are enforceable (CPU/RAM) via K8s manifest.
# US: US-BRIDGE-01 (Cloud Worker Container - Parity Runtime)

set -e

# Check for K8s worker deployment manifest
K8S_MANIFEST="livecalc-cloud/k8s/worker-deployment.yaml"

if [[ ! -f "$K8S_MANIFEST" ]]; then
    echo "FAIL: K8s worker deployment manifest not found at $K8S_MANIFEST"
    echo "Expected: File exists"
    echo "Actual: File not found"
    exit 1
fi

# Verify resources section exists
if ! grep -q "resources:" "$K8S_MANIFEST"; then
    echo "FAIL: No resources section in K8s manifest"
    echo "Expected: resources: section with limits"
    echo "Actual: No resources section found"
    exit 1
fi

# Verify limits are specified
if ! grep -q "limits:" "$K8S_MANIFEST"; then
    echo "FAIL: No limits section in K8s manifest"
    echo "Expected: limits: section with CPU/memory"
    echo "Actual: No limits section found"
    exit 1
fi

# Verify memory limit is specified
if ! grep -q "memory:" "$K8S_MANIFEST"; then
    echo "FAIL: No memory limit in K8s manifest"
    echo "Expected: memory: limit specified"
    echo "Actual: No memory limit found"
    exit 1
fi

# Verify CPU limit is specified
if ! grep -q "cpu:" "$K8S_MANIFEST"; then
    echo "FAIL: No CPU limit in K8s manifest"
    echo "Expected: cpu: limit specified"
    echo "Actual: No CPU limit found"
    exit 1
fi

echo "PASS: Resource limits (CPU/RAM) are enforceable via K8s manifest"
exit 0
