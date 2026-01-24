#!/bin/bash
# Test: US-008 AC-08 - Log performance metrics (policies/sec, memory usage)
# AC: Log performance metrics (policies/sec, memory usage)

LOGGER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/logging/logger.ts"

if [[ ! -f "$LOGGER_FILE" ]]; then
    echo "FAIL: Logger file not found"
    exit 1
fi

# Check for performance metrics logging
if ! grep -q 'PerformanceMetrics\|performance' "$LOGGER_FILE"; then
    echo "FAIL: No performance metrics logging"
    echo "Expected: PerformanceMetrics or performance logging"
    echo "Actual: not found"
    exit 1
fi

# Check for policies/second or throughput
if ! grep -qi 'polic\|throughput\|perSecond' "$LOGGER_FILE"; then
    echo "FAIL: No throughput metrics"
    echo "Expected: policies/sec or throughput metric"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Logger includes performance metrics"
exit 0
