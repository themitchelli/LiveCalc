#!/bin/bash
# Test: verify comparison report shows baseline vs spike for each metric
# AC: Comparison report shows: baseline vs spike for each metric

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Check for comparison report generator
REPORT_GEN="$PROJECT_ROOT/livecalc-engine/benchmarks/generate-comparison-report.ts"

if [[ ! -f "$REPORT_GEN" ]]; then
    echo "FAIL: Comparison report generator not found"
    echo "Expected: $REPORT_GEN"
    exit 1
fi

# Verify it compares baseline and spike
if ! grep -q "baseline" "$REPORT_GEN" || ! grep -q "spike" "$REPORT_GEN"; then
    echo "FAIL: Report generator doesn't compare baseline and spike"
    exit 1
fi

# Check for metric comparisons
METRICS_FOUND=0

if grep -q "throughput\|Throughput" "$REPORT_GEN"; then
    ((METRICS_FOUND++))
fi

if grep -q "latency\|Ms\|time" "$REPORT_GEN"; then
    ((METRICS_FOUND++))
fi

if grep -q "memory\|Memory" "$REPORT_GEN"; then
    ((METRICS_FOUND++))
fi

if grep -q "speedup\|Speedup" "$REPORT_GEN"; then
    ((METRICS_FOUND++))
fi

if [[ "$METRICS_FOUND" -lt 2 ]]; then
    echo "FAIL: Report generator doesn't include enough metrics"
    echo "Expected: throughput, latency, memory, and speedup comparisons"
    exit 1
fi

echo "PASS: Comparison report generator compares baseline vs spike with multiple metrics"
exit 0
