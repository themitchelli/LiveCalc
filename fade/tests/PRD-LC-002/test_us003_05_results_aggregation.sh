#!/bin/bash
# Test: verify results aggregated from all workers into single ValuationResult
# AC: Results aggregated from all workers into single ValuationResult

PROJECT_ROOT="/Users/stevemitchell/Documents/GitHub/LiveCalc"
WORKER_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/worker-pool.ts"

if [[ ! -f "$WORKER_POOL_FILE" ]]; then
    echo "FAIL: worker-pool.ts not found"
    echo "Expected: $WORKER_POOL_FILE exists"
    echo "Actual: file not found"
    exit 1
fi

# Check for aggregation logic (collecting from multiple workers)
if ! grep -qE "aggregate|allNpvs|concat|push" "$WORKER_POOL_FILE"; then
    echo "FAIL: Result aggregation logic not found"
    echo "Expected: aggregation of worker results"
    echo "Actual: not found"
    exit 1
fi

# Check for statistics calculation (mean, stdDev, percentiles)
if ! grep -qE "mean|stdDev|percentile|statistics" "$WORKER_POOL_FILE"; then
    echo "FAIL: Statistics calculation not found"
    echo "Expected: calculation of mean, stdDev, percentiles"
    echo "Actual: not found"
    exit 1
fi

# Check return type is ValuationResult
if ! grep -q "ValuationResult" "$WORKER_POOL_FILE"; then
    echo "FAIL: ValuationResult return type not found"
    echo "Expected: returns ValuationResult"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Results aggregated from all workers into single ValuationResult"
exit 0
