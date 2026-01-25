#!/bin/bash
# Test: verify infrastructure.md documents 'Everything as Code' principle
# AC: 'Everything as Code' principle documented

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for Everything as Code mention
if ! grep -qi "Everything as Code\|as Code" "$INFRA_FILE"; then
    echo "FAIL: 'Everything as Code' principle not documented"
    echo "Expected: Everything as Code principle"
    echo "Actual: Not found"
    exit 1
fi

# Check for key components mentioned
if ! grep -qi "infrastructure\|configuration\|secret\|monitoring\|documentation" "$INFRA_FILE"; then
    echo "FAIL: Components to manage as code not documented"
    echo "Expected: Infrastructure, configuration, secrets, monitoring, docs"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: 'Everything as Code' principle documented"
exit 0
