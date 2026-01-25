#!/bin/bash
# Test: verify infrastructure.md documents GitHub Actions for CI/CD
# AC: GitHub Actions for CI/CD

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for GitHub Actions mention
if ! grep -qi "GitHub Actions\|CI/CD" "$INFRA_FILE"; then
    echo "FAIL: GitHub Actions CI/CD not documented"
    echo "Expected: GitHub Actions for CI/CD"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: GitHub Actions CI/CD documented"
exit 0
