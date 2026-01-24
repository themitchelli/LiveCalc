#!/bin/bash
# Test: verify coding.md documents domain terminology preference
# AC: Naming: Use domain terms (policies, assumptions, projections) not generic terms (items, data, values)

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    exit 1
fi

# Check for domain terms preference
if ! grep -qi "policies\|assumptions\|projections\|domain" "$CODING_FILE"; then
    echo "FAIL: Domain terminology preference not documented"
    echo "Expected: Preference for domain terms (policies, assumptions, projections)"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Domain terminology documented (policies, assumptions, projections)"
exit 0
