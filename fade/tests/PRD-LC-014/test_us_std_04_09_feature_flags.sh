#!/bin/bash
# Test: verify infrastructure.md documents feature flags
# AC: Feature flags in config files (not environment variables)

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for feature flags mention
if ! grep -qi "feature flag\|feature" "$INFRA_FILE"; then
    echo "FAIL: Feature flags not documented"
    echo "Expected: Feature flags in config files"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Feature flags documented"
exit 0
