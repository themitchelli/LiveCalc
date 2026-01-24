#!/bin/bash
# Test: verify breakpoints are persisted in workspace settings
# AC: Breakpoints persisted in workspace settings

BREAKPOINT_FILE="livecalc-vscode/src/pipeline/breakpoint-manager.ts"

# Assert - Check for loadBreakpoints method
if ! grep -q 'loadBreakpoints' "$BREAKPOINT_FILE"; then
    echo "FAIL: No loadBreakpoints method"
    echo "Expected: loadBreakpoints for restoring state"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for saveBreakpoints method
if ! grep -q 'saveBreakpoints' "$BREAKPOINT_FILE"; then
    echo "FAIL: No saveBreakpoints method"
    echo "Expected: saveBreakpoints for persistence"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for workspaceState usage
if ! grep -q 'workspaceState' "$BREAKPOINT_FILE"; then
    echo "FAIL: Does not use workspaceState"
    echo "Expected: VS Code workspaceState for persistence"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for livecalc.pipeline.breakpoints key
if ! grep -q 'livecalc.*breakpoints\|pipeline.*breakpoints' "$BREAKPOINT_FILE"; then
    echo "FAIL: No breakpoints storage key"
    echo "Expected: Breakpoints storage key in workspace"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Breakpoints persisted in workspace settings"
exit 0
