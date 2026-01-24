#!/bin/bash
# Test: verify single-engine configs (no pipeline block) continue to work
# AC: Single-engine configs (no pipeline block) continue to work unchanged

SCHEMA_FILE="livecalc-vscode/schemas/livecalc.config.schema.json"

# Assert - Check that pipeline is NOT in required array
# The required array should only contain model, assumptions, scenarios
if grep -A 1 '"required":' "$SCHEMA_FILE" | head -1 | grep -q '"pipeline"'; then
    echo "FAIL: 'pipeline' is listed as required in schema"
    echo "Expected: 'pipeline' to be optional (not in required array)"
    echo "Actual: 'pipeline' found in required array"
    exit 1
fi

# Assert - Check the actual required fields
REQUIRED_FIELDS=$(grep -A 1 '"required":' "$SCHEMA_FILE" | head -1)
if ! echo "$REQUIRED_FIELDS" | grep -q '"model"'; then
    echo "FAIL: 'model' is not in required fields"
    echo "Expected: 'model' to be required"
    echo "Actual: Not found in required array"
    exit 1
fi

# Assert - Verify pipeline is defined but optional
if ! grep -q '"pipeline"' "$SCHEMA_FILE"; then
    echo "FAIL: 'pipeline' property not defined in schema"
    echo "Expected: 'pipeline' to be defined (but optional)"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Single-engine configs (no pipeline block) continue to work unchanged"
exit 0
