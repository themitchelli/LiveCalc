#!/bin/bash
# Test: verify input/output keys support the 'bus://' prefix
# AC: Input/Output keys support the 'bus://' prefix for shared memory

SCHEMA_FILE="livecalc-vscode/schemas/livecalc.config.schema.json"
VALIDATOR_FILE="livecalc-vscode/src/pipeline/pipeline-validator.ts"

# Assert - Check schema has bus:// pattern
if ! grep -q 'bus://' "$SCHEMA_FILE"; then
    echo "FAIL: Schema does not reference 'bus://' prefix"
    echo "Expected: 'bus://' pattern in schema"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check validator has bus pattern regex
if ! grep -q 'BUS_REF_PATTERN' "$VALIDATOR_FILE"; then
    echo "FAIL: Pipeline validator does not define BUS_REF_PATTERN"
    echo "Expected: BUS_REF_PATTERN constant in validator"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Verify bus pattern validates bus:// format
if ! grep -q 'bus://' "$VALIDATOR_FILE"; then
    echo "FAIL: Pipeline validator does not validate 'bus://' format"
    echo "Expected: 'bus://' in validator patterns"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Input/output keys support 'bus://' prefix for shared memory"
exit 0
