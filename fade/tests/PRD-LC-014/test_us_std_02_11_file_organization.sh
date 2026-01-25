#!/bin/bash
# Test: verify coding.md documents file organization
# AC: File organization: 'Group by feature (pipeline/, assumptions-manager/) not by type (models/, services/)'

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    exit 1
fi

# Check for file organization section
if ! grep -qi "file organization\|organize\|feature" "$CODING_FILE"; then
    echo "FAIL: File organization not documented"
    echo "Expected: Feature-based organization guidance"
    echo "Actual: Not found"
    exit 1
fi

# Check for feature-based preference
if ! grep -qi "pipeline\|assumptions" "$CODING_FILE"; then
    echo "FAIL: Feature-based organization examples not found"
    echo "Expected: Examples like pipeline/, assumptions-manager/"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: File organization documented (group by feature)"
exit 0
