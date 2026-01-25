#!/bin/bash
# Test: verify infrastructure.md documents immutable infrastructure
# AC: Immutable infrastructure: 'Replace, do not modify. Container images are immutable.'

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for immutable infrastructure mention
if ! grep -qi "immutable" "$INFRA_FILE"; then
    echo "FAIL: Immutable infrastructure not documented"
    echo "Expected: Immutable infrastructure principle"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Immutable infrastructure documented"
exit 0
