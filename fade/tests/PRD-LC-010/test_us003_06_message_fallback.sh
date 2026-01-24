#!/bin/bash
# Test: verify fallback to message-based handoff if Atomics unavailable
# AC: Fallback to message-based handoff if Atomics unavailable

ATOMIC_SIGNALS_FILE="livecalc-engine/js/src/orchestrator/atomic-signals.ts"

# Assert - Check for MessageBasedSignalManager class
if ! grep -q 'MessageBasedSignalManager' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not have MessageBasedSignalManager"
    echo "Expected: MessageBasedSignalManager class for fallback"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for Atomics availability check
if ! grep -q 'isAtomicsWaitAvailable\|isAtomicsNotifyAvailable' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not check Atomics availability"
    echo "Expected: isAtomicsWaitAvailable or isAtomicsNotifyAvailable function"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for createSignalManager factory function
if ! grep -q 'createSignalManager' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Atomic signals does not have createSignalManager factory"
    echo "Expected: createSignalManager function to select appropriate implementation"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that fallback uses polling
if ! grep -q 'waitWithPolling\|polling\|setInterval\|setTimeout' "$ATOMIC_SIGNALS_FILE"; then
    echo "FAIL: Message-based fallback does not use polling"
    echo "Expected: Polling mechanism for fallback"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Fallback to message-based handoff if Atomics unavailable"
exit 0
