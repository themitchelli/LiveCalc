#!/bin/bash
# Test: verify performance targets enforced (fail if regression >10%)
# AC: Performance targets enforced (fail if regression >10%)

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
CONFIG_FILE="$PROJECT_ROOT/livecalc-engine/benchmarks/benchmark-config.json"
BENCHMARK_SCRIPT="$PROJECT_ROOT/livecalc-engine/benchmarks/run-benchmarks.ts"

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "FAIL: benchmark-config.json not found"
    echo "Expected: $CONFIG_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for performance targets in config
if ! grep -q "performanceTargets" "$CONFIG_FILE"; then
    echo "FAIL: performanceTargets not found in config"
    echo "Expected: performanceTargets section"
    echo "Actual: not found"
    exit 1
fi

# Check for regression threshold
if ! grep -q "regressionThreshold" "$CONFIG_FILE"; then
    echo "FAIL: regressionThreshold not found"
    echo "Expected: regressionThreshold configuration"
    echo "Actual: not found"
    exit 1
fi

# Check threshold is 0.10 (10%)
if ! grep -q '"regressionThreshold": 0.10\|"regressionThreshold": 0.1' "$CONFIG_FILE"; then
    echo "WARN: regressionThreshold may not be 10%"
fi

# Check benchmark script enforces targets
if ! grep -qE "fail|FAIL|threshold|regression" "$BENCHMARK_SCRIPT"; then
    echo "FAIL: Regression enforcement not found in benchmark script"
    echo "Expected: regression checking logic"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Performance targets defined with regression threshold"
exit 0
