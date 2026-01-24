#!/bin/bash
# Test: verify infrastructure.md documents zero-downtime deployment
# AC: Blue/green or rolling updates (zero downtime)

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for deployment strategy mention
if ! grep -qi "rolling\|blue.*green\|zero downtime" "$INFRA_FILE"; then
    echo "FAIL: Zero-downtime deployment not documented"
    echo "Expected: Rolling updates or blue/green deployment"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Zero-downtime deployment documented"
exit 0
