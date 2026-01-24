#!/bin/bash
# Test: verify breakpoints can be set on pipeline nodes via UI or config
# AC: Set breakpoints on pipeline nodes via UI or config

BREAKPOINT_FILE="livecalc-vscode/src/pipeline/breakpoint-manager.ts"
SCHEMA_FILE="livecalc-vscode/schemas/livecalc.config.schema.json"

# Assert - Check for BreakpointManager class
if ! grep -q 'BreakpointManager' "$BREAKPOINT_FILE"; then
    echo "FAIL: No BreakpointManager class"
    echo "Expected: BreakpointManager for breakpoint management"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for toggleBreakpoint method
if ! grep -q 'toggleBreakpoint' "$BREAKPOINT_FILE"; then
    echo "FAIL: No toggleBreakpoint method"
    echo "Expected: toggleBreakpoint for UI toggling"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for importFromConfig method
if ! grep -q 'importFromConfig' "$BREAKPOINT_FILE"; then
    echo "FAIL: No importFromConfig method"
    echo "Expected: importFromConfig for config-based breakpoints"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check schema has breakpoints configuration
if ! grep -q '"breakpoints"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema does not include breakpoints"
    echo "Expected: breakpoints array in debug config"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Set breakpoints on pipeline nodes via UI or config"
exit 0
