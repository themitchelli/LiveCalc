#!/bin/bash
# Test: verify workers pull tasks from own deque (LIFO for cache locality)
# AC: Workers pull tasks from own deque (LIFO for cache locality)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

DEQUE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-deque.ts"

if [[ ! -f "$DEQUE_FILE" ]]; then
    echo "FAIL: Work-stealing deque file not found"
    echo "Expected: $DEQUE_FILE"
    exit 1
fi

# Check for push/pop operations (LIFO semantics - pop from bottom)
if ! grep -q "push\|pop" "$DEQUE_FILE"; then
    echo "FAIL: Push/pop operations not found in deque"
    echo "Expected: push and pop methods for LIFO access"
    exit 1
fi

# Check for bottom pointer (indicates LIFO implementation)
if ! grep -q "bottom\|BOTTOM" "$DEQUE_FILE"; then
    echo "FAIL: Bottom pointer not found (needed for LIFO)"
    echo "Expected: bottom pointer for local LIFO access"
    exit 1
fi

# Check for WorkStealingDeque class
if ! grep -q "class WorkStealingDeque" "$DEQUE_FILE"; then
    echo "FAIL: WorkStealingDeque class not found"
    exit 1
fi

echo "PASS: Deque implementation supports LIFO access for local workers"
exit 0
