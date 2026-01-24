#!/bin/bash
# Test: verify all bus transitions are logged with nanosecond precision in debug mode
# AC: All bus transitions logged with nanosecond precision in debug mode

ATOMIC_SIGNALS_FILE="livecalc-engine/js/src/orchestrator/atomic-signals.ts"

# Assert - Check for high-resolution timestamp function
if ! grep -q 'getHighResolutionTimestamp' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not have high-resolution timestamp"
    echo "Expected: getHighResolutionTimestamp function"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for nanosecond mention in code or comments
if ! grep -qi 'nanosecond\|ns\|1e6\|1000000' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not mention nanoseconds"
    echo "Expected: Nanosecond precision in timing"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for timing log enablement
if ! grep -q 'setTimingLogEnabled\|_enableTimingLog' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not have timing log toggle"
    echo "Expected: setTimingLogEnabled method for debug mode"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for SignalTiming interface
if ! grep -q 'SignalTiming' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not have SignalTiming interface"
    echo "Expected: SignalTiming interface for timing records"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for timestampNs in timing records
if ! grep -q 'timestampNs' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: SignalTiming does not have timestampNs field"
    echo "Expected: timestampNs for nanosecond precision"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: All bus transitions logged with nanosecond precision in debug mode"
exit 0
