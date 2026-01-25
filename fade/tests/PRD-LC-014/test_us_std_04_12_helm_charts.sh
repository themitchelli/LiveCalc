#!/bin/bash
# Test: verify infrastructure.md documents Helm charts
# AC: Helm charts for Kubernetes deployments

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for Helm mention
if ! grep -qi "Helm" "$INFRA_FILE"; then
    echo "FAIL: Helm charts not documented"
    echo "Expected: Helm charts for Kubernetes"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Helm charts documented"
exit 0
