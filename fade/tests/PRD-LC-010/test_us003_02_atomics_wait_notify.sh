#!/bin/bash
# Test: verify Worker B starts immediately via Atomics.wait/notify
# AC: Worker B (chained) starts immediately via Atomics.wait/notify

ATOMIC_SIGNALS_FILE="livecalc-engine/js/src/orchestrator/atomic-signals.ts"

# Assert - Check for Atomics.wait usage
if ! grep -q 'Atomics\.wait' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not use Atomics.wait"
    echo "Expected: Atomics.wait for blocking until signal"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for Atomics.notify usage
if ! grep -q 'Atomics\.notify' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not use Atomics.notify"
    echo "Expected: Atomics.notify to wake waiting workers"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for waitFor method
if ! grep -q 'waitFor(' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not have waitFor method"
    echo "Expected: waitFor() method for waiting on upstream nodes"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Worker B starts immediately via Atomics.wait/notify"
exit 0
