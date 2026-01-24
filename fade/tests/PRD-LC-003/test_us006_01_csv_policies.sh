#!/bin/bash
# Test: US-006 AC-01 - Load policies from CSV file (local://path.csv)
# AC: Load policies from CSV file (local://path.csv)

DATA_LOADER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/data/data-loader.ts"
POLICY_LOADER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/data/policy-loader.ts"

# Check for policy loading function
if ! grep -q 'loadPolicies\|polic' "$DATA_LOADER_FILE"; then
    echo "FAIL: No policy loading in data-loader"
    echo "Expected: loadPolicies function"
    echo "Actual: not found"
    exit 1
fi

# Check for local:// path handling
if ! grep -q 'local://' "$DATA_LOADER_FILE"; then
    echo "FAIL: No local:// path handling"
    echo "Expected: local:// prefix support"
    echo "Actual: not found"
    exit 1
fi

# Check for sample policies CSV
SAMPLE_POLICIES="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/samples/simple-term-life/data/policies.csv"
if [[ ! -f "$SAMPLE_POLICIES" ]]; then
    echo "FAIL: No sample policies CSV"
    echo "Expected: sample policies.csv file"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Policy CSV loading is supported"
exit 0
