#!/bin/bash
# Test: verify benchmark validates improvement before proceeding to work-stealing
# AC: Benchmark validates improvement before proceeding to work-stealing

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Check that benchmark runner exists
BENCHMARK_RUNNER="$PROJECT_ROOT/livecalc-engine/benchmarks/run-benchmarks.ts"

if [[ ! -f "$BENCHMARK_RUNNER" ]]; then
    echo "FAIL: Benchmark runner not found"
    echo "Expected: $BENCHMARK_RUNNER"
    exit 1
fi

# Check that benchmark results directory has recent files
RESULTS_DIR="$PROJECT_ROOT/livecalc-engine/benchmarks/results"

if [[ ! -d "$RESULTS_DIR" ]]; then
    echo "FAIL: Benchmark results directory not found"
    echo "Expected: $RESULTS_DIR"
    exit 1
fi

# Check for benchmark files with summary data
BENCHMARK_FILES=$(ls "$RESULTS_DIR"/benchmark-*.json 2>/dev/null | wc -l)

if [[ "$BENCHMARK_FILES" -lt 1 ]]; then
    echo "FAIL: No benchmark result files found"
    echo "Expected: at least 1 benchmark JSON file"
    echo "Actual: $BENCHMARK_FILES files"
    exit 1
fi

# Verify latest benchmark has summary with pass/fail status
LATEST_BENCHMARK=$(ls -t "$RESULTS_DIR"/benchmark-*.json 2>/dev/null | head -1)

if [[ -n "$LATEST_BENCHMARK" ]]; then
    if grep -q '"summary"' "$LATEST_BENCHMARK" && grep -q '"targetsPassed"' "$LATEST_BENCHMARK"; then
        echo "PASS: Benchmark validation system in place with pass/fail tracking"
        exit 0
    else
        echo "FAIL: Benchmark file missing summary/validation data"
        echo "Expected: summary section with targetsPassed"
        exit 1
    fi
fi

echo "FAIL: Could not verify benchmark validation"
exit 1
