#!/bin/bash
# Test: verify reports: execution time, memory usage, policies/second, scenarios/second
# AC: Reports: execution time, memory usage, policies/second, scenarios/second

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
BENCHMARK_SCRIPT="$PROJECT_ROOT/livecalc-engine/benchmarks/run-benchmarks.ts"

if [[ ! -f "$BENCHMARK_SCRIPT" ]]; then
    echo "FAIL: run-benchmarks.ts not found"
    echo "Expected: $BENCHMARK_SCRIPT exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for execution time reporting
if ! grep -qE "executionTime|timeMs|duration" "$BENCHMARK_SCRIPT"; then
    echo "FAIL: Execution time reporting not found"
    echo "Expected: execution time metrics"
    echo "Actual: not found"
    exit 1
fi

# Check for memory reporting
if ! grep -qE "memory|Memory|heapUsed" "$BENCHMARK_SCRIPT"; then
    echo "FAIL: Memory usage reporting not found"
    echo "Expected: memory usage metrics"
    echo "Actual: not found"
    exit 1
fi

# Check for throughput metrics (policies/second, scenarios/second)
if ! grep -qE "policies.*second|policiesPerSec|throughput" "$BENCHMARK_SCRIPT"; then
    echo "FAIL: Policies/second throughput not found"
    echo "Expected: policies per second metric"
    echo "Actual: not found"
    exit 1
fi

if ! grep -qE "scenarios.*second|scenariosPerSec|projections" "$BENCHMARK_SCRIPT"; then
    echo "FAIL: Scenarios/second throughput not found"
    echo "Expected: scenarios per second metric"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Benchmark reports execution time, memory, and throughput metrics"
exit 0
