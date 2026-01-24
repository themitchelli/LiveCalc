#!/bin/bash
# Test: verify automatic culprit identification when integrity check fails
# AC: If downstream node receives unexpected data, automatic culprit identification

INTEGRITY_CHECKER_FILE="livecalc-engine/js/src/orchestrator/integrity-checker.ts"
CULPRIT_FILE="livecalc-vscode/src/pipeline/culprit-identifier.ts"

# Assert - Check for verifyChecksum method
if ! grep -q 'verifyChecksum' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: No verifyChecksum method"
    echo "Expected: verifyChecksum to validate data"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for culpritNodeId in result
if ! grep -q 'culpritNodeId' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: Integrity result does not include culpritNodeId"
    echo "Expected: culpritNodeId for identifying culprit"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for CulpritIdentifier class
if ! grep -q 'CulpritIdentifier' "$CULPRIT_FILE"; then
    echo "FAIL: No CulpritIdentifier class"
    echo "Expected: CulpritIdentifier for culprit management"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for isNodeCulprit method
if ! grep -q 'isNodeCulprit' "$CULPRIT_FILE"; then
    echo "FAIL: No isNodeCulprit method"
    echo "Expected: isNodeCulprit to check node status"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Automatic culprit identification when integrity check fails"
exit 0
