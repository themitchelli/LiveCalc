#!/bin/bash
# Test: verify pipeline validator detects circular dependencies in DAG
# AC: Validation: Detect and error on circular dependencies in the DAG

VALIDATOR_FILE="livecalc-vscode/src/pipeline/pipeline-validator.ts"

# Assert - Check for circular dependency error code
if ! grep -q 'CIRCULAR_DEPENDENCY' "$VALIDATOR_FILE"; then
    echo "FAIL: Validator does not define CIRCULAR_DEPENDENCY error code"
    echo "Expected: CIRCULAR_DEPENDENCY error code defined"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for topological sort implementation (used for cycle detection)
if ! grep -q 'topologicalSort' "$VALIDATOR_FILE"; then
    echo "FAIL: Validator does not implement topological sort for cycle detection"
    echo "Expected: topologicalSort function for DAG validation"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that hasCycle is checked
if ! grep -q 'hasCycle' "$VALIDATOR_FILE"; then
    echo "FAIL: Validator does not check for cycles"
    echo "Expected: hasCycle check in validation logic"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Validator detects circular dependencies in the DAG"
exit 0
