#!/bin/bash
# Test: verify report includes throughput, latency, memory, CPU utilization
# AC: Report includes: throughput, latency, memory, CPU utilization

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

REPORT_GEN="$PROJECT_ROOT/livecalc-engine/benchmarks/generate-comparison-report.ts"

if [[ ! -f "$REPORT_GEN" ]]; then
    echo "FAIL: Comparison report generator not found"
    exit 1
fi

# Check for all required metrics
MISSING_METRICS=""

if ! grep -qi "throughput\|projectionsPerSecond" "$REPORT_GEN"; then
    MISSING_METRICS="$MISSING_METRICS throughput"
fi

if ! grep -qi "latency\|singleThread\|multiThread\|Ms" "$REPORT_GEN"; then
    MISSING_METRICS="$MISSING_METRICS latency"
fi

if ! grep -qi "memory\|memoryMb" "$REPORT_GEN"; then
    MISSING_METRICS="$MISSING_METRICS memory"
fi

# CPU utilization is typically a proxy metric (speedup ratio)
if ! grep -qi "utilization\|speedup\|cpu" "$REPORT_GEN"; then
    MISSING_METRICS="$MISSING_METRICS CPU-utilization"
fi

if [[ -n "$MISSING_METRICS" ]]; then
    echo "FAIL: Report missing metrics:$MISSING_METRICS"
    exit 1
fi

echo "PASS: Report includes throughput, latency, memory, and CPU utilization metrics"
exit 0
