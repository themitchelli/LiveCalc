#!/bin/bash
# Test: verify configurations tested: 1K/10K/100K policies × 100/1K/10K scenarios
# AC: Configurations tested: 1K/10K/100K policies × 100/1K/10K scenarios

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
CONFIG_FILE="$PROJECT_ROOT/livecalc-engine/benchmarks/benchmark-config.json"

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "FAIL: benchmark-config.json not found"
    echo "Expected: $CONFIG_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for various policy counts
if ! grep -q '"policies": 1000' "$CONFIG_FILE"; then
    echo "FAIL: 1K policies configuration not found"
    echo "Expected: policies: 1000 configuration"
    echo "Actual: not found"
    exit 1
fi

if ! grep -q '"policies": 10000' "$CONFIG_FILE"; then
    echo "FAIL: 10K policies configuration not found"
    echo "Expected: policies: 10000 configuration"
    echo "Actual: not found"
    exit 1
fi

if ! grep -q '"policies": 100000' "$CONFIG_FILE"; then
    echo "FAIL: 100K policies configuration not found"
    echo "Expected: policies: 100000 configuration"
    echo "Actual: not found"
    exit 1
fi

# Check for various scenario counts
if ! grep -q '"scenarios": 100' "$CONFIG_FILE"; then
    echo "FAIL: 100 scenarios configuration not found"
    echo "Expected: scenarios: 100 configuration"
    echo "Actual: not found"
    exit 1
fi

if ! grep -q '"scenarios": 1000' "$CONFIG_FILE"; then
    echo "FAIL: 1K scenarios configuration not found"
    echo "Expected: scenarios: 1000 configuration"
    echo "Actual: not found"
    exit 1
fi

if ! grep -q '"scenarios": 10000' "$CONFIG_FILE"; then
    echo "FAIL: 10K scenarios configuration not found"
    echo "Expected: scenarios: 10000 configuration"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: All required benchmark configurations present"
exit 0
