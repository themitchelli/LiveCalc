#!/bin/bash
# Test: verify option to enable/disable integrity checks
# AC: Option to enable/disable integrity checks (performance tradeoff)

INTEGRITY_CHECKER_FILE="livecalc-engine/js/src/orchestrator/integrity-checker.ts"
SCHEMA_FILE="livecalc-vscode/schemas/livecalc.config.schema.json"

# Assert - Check for enabled config option
if ! grep -q '_enabled\|enabled:' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: IntegrityChecker does not have enabled option"
    echo "Expected: enabled configuration for toggling"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for isEnabled method
if ! grep -q 'isEnabled' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: No isEnabled method"
    echo "Expected: isEnabled to check state"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check schema has enableIntegrityChecks option
if ! grep -q 'enableIntegrityChecks' "$SCHEMA_FILE"; then
    echo "FAIL: Schema does not include enableIntegrityChecks"
    echo "Expected: enableIntegrityChecks in debug config"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that disabled checker returns early
if ! grep -q 'if.*!.*_enabled\|!this._enabled' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: Checker does not skip when disabled"
    echo "Expected: Early return when disabled"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Option to enable/disable integrity checks"
exit 0
