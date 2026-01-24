#!/bin/bash
# Test: verify infrastructure.md documents version control
# AC: Version control: 'All code, config, and IaC in Git. Tag releases with semantic versioning.'

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for version control mention
if ! grep -qi "version control\|Git\|semantic version" "$INFRA_FILE"; then
    echo "FAIL: Version control not documented"
    echo "Expected: Git and semantic versioning"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Version control documented"
exit 0
