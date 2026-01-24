#!/bin/bash
# Test: verify example warning messages exist
# AC: Example warning: 'Large policy file may cause slow execution'
# AC: Example warning: 'Some policies have age > 100, using capped mortality'

ERROR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/error-types.ts"

# Check for COMMON_WARNINGS constant
if ! grep -q "COMMON_WARNINGS" "$ERROR_FILE"; then
    echo "FAIL: COMMON_WARNINGS constant not found"
    exit 1
fi

# Check for large policy file warning
if ! grep -q "LARGE_POLICY_FILE" "$ERROR_FILE"; then
    echo "FAIL: LARGE_POLICY_FILE warning not found"
    exit 1
fi

# Check for age capped warning
if ! grep -q "AGE_CAPPED" "$ERROR_FILE"; then
    echo "FAIL: AGE_CAPPED warning not found"
    exit 1
fi

# Check warning mentions slow execution
if ! grep -q "slow execution" "$ERROR_FILE"; then
    echo "FAIL: 'slow execution' warning text not found"
    exit 1
fi

# Check warning mentions capped mortality
if ! grep -q "capped mortality" "$ERROR_FILE"; then
    echo "FAIL: 'capped mortality' warning text not found"
    exit 1
fi

echo "PASS: Example warnings for large files and age capping exist"
exit 0
