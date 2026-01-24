#!/bin/bash
# Test: verify integrity report shows expected/actual checksum and diff location
# AC: Integrity report shows: expected checksum, actual checksum, diff location

INTEGRITY_CHECKER_FILE="livecalc-engine/js/src/orchestrator/integrity-checker.ts"
CULPRIT_FILE="livecalc-vscode/src/pipeline/culprit-identifier.ts"

# Assert - Check for IntegrityCheckResult interface
if ! grep -q 'IntegrityCheckResult' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: No IntegrityCheckResult interface"
    echo "Expected: IntegrityCheckResult for check results"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for expectedChecksum field
if ! grep -q 'expectedChecksum' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: Result does not include expectedChecksum"
    echo "Expected: expectedChecksum field in result"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for actualChecksum field
if ! grep -q 'actualChecksum' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: Result does not include actualChecksum"
    echo "Expected: actualChecksum field in result"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for diffOffset field
if ! grep -q 'diffOffset' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: Result does not include diffOffset"
    echo "Expected: diffOffset for first difference location"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for generateTextReport in culprit identifier
if ! grep -q 'generateTextReport\|generateReport' "$CULPRIT_FILE"; then
    echo "FAIL: No report generation method"
    echo "Expected: generateTextReport for readable output"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Integrity report shows expected/actual checksum and diff location"
exit 0
