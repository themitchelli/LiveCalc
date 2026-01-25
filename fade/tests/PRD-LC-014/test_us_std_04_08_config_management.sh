#!/bin/bash
# Test: verify infrastructure.md documents configuration management
# AC: Environment config in values-{env}.yaml files, Secrets referenced from Key Vault

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for config management mention
if ! grep -qi "values.*yaml\|config\|configuration" "$INFRA_FILE"; then
    echo "FAIL: Configuration management not documented"
    echo "Expected: Environment config in values-{env}.yaml"
    echo "Actual: Not found"
    exit 1
fi

# Check for Key Vault secrets reference
if ! grep -qi "Key Vault\|secret" "$INFRA_FILE"; then
    echo "FAIL: Secrets from Key Vault not documented"
    echo "Expected: Secrets referenced from Key Vault"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Configuration management documented"
exit 0
