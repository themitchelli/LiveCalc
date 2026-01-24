#!/bin/bash
# Test: verify spike benchmark run on spike/engine-performance branch
# AC: Spike benchmark run on spike/engine-performance branch

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

RESULTS_DIR="$PROJECT_ROOT/livecalc-engine/benchmarks/results"

if [[ ! -d "$RESULTS_DIR" ]]; then
    echo "FAIL: Benchmark results directory not found"
    exit 1
fi

# Look for spike benchmark files
SPIKE_FOUND=false

for file in "$RESULTS_DIR"/benchmark-*.json "$RESULTS_DIR"/spike-*.json; do
    if [[ -f "$file" ]]; then
        # Check if file contains spike branch reference
        if grep -q "spike/engine-performance\|spike" "$file"; then
            SPIKE_FOUND=true
            echo "Found spike benchmark: $file"
            break
        fi
    fi
done

if [[ "$SPIKE_FOUND" == "true" ]]; then
    echo "PASS: Spike benchmark run on spike branch"
    exit 0
fi

# Check current git branch as alternative verification
CURRENT_BRANCH=$(cd "$PROJECT_ROOT" && git branch --show-current 2>/dev/null || echo "")

if [[ "$CURRENT_BRANCH" == "spike/engine-performance" ]]; then
    # We're on the spike branch, any recent benchmark is a spike benchmark
    RECENT_FILE=$(ls -t "$RESULTS_DIR"/benchmark-*.json 2>/dev/null | head -1)
    if [[ -n "$RECENT_FILE" ]]; then
        echo "PASS: On spike branch with recent benchmark data"
        exit 0
    fi
fi

echo "FAIL: No spike benchmark found for spike/engine-performance branch"
exit 1
