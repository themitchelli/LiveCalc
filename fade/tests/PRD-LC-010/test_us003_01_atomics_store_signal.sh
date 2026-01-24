#!/bin/bash
# Test: verify Worker A signals completion via Atomics.store to status byte
# AC: Worker A signals completion via Atomics.store to a dedicated status byte

ATOMIC_SIGNALS_FILE="livecalc-engine/js/src/orchestrator/atomic-signals.ts"

# Assert - Check file exists
if [[ ! -f "$ATOMIC_SIGNALS_FILE" ]]; then
    echo "FAIL: Atomic signals file does not exist"
    echo "Expected: $ATOMIC_SIGNALS_FILE exists"
    echo "Actual: File not found"
    exit 1
fi

# Assert - Check for Atomics.store usage
if ! grep -q 'Atomics\.store\|Atomics\.exchange' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not use Atomics.store/exchange"
    echo "Expected: Atomics.store or Atomics.exchange for signaling"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for signal method
if ! grep -q 'signal(' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not have signal method"
    echo "Expected: signal() method for state transitions"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for NodeState enum with COMPLETE
if ! grep -q 'COMPLETE.*=.*3\|NodeState\.COMPLETE' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: NodeState does not have COMPLETE state"
    echo "Expected: COMPLETE state in NodeState enum"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Worker A signals completion via Atomics.store to status byte"
exit 0
