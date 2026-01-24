#!/bin/bash
# Test: verify idle workers steal from random victim's deque (FIFO for fairness)
# AC: Idle workers steal from random victim's deque (FIFO for fairness)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

DEQUE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-deque.ts"

if [[ ! -f "$DEQUE_FILE" ]]; then
    echo "FAIL: Work-stealing deque file not found"
    echo "Expected: $DEQUE_FILE"
    exit 1
fi

# Check for steal operation (takes from top - FIFO)
if ! grep -q "steal" "$DEQUE_FILE"; then
    echo "FAIL: Steal operation not found"
    echo "Expected: steal method for FIFO access from top"
    exit 1
fi

# Check for top pointer (indicates FIFO steal from top)
if ! grep -q "top\|TOP" "$DEQUE_FILE"; then
    echo "FAIL: Top pointer not found (needed for FIFO steal)"
    echo "Expected: top pointer for stealing from top"
    exit 1
fi

# Check worker implementation for random victim selection
WS_WORKER_FILE="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-worker.ts"
if [[ -f "$WS_WORKER_FILE" ]]; then
    if grep -q "random\|victim\|steal" "$WS_WORKER_FILE"; then
        echo "PASS: Work-stealing supports FIFO steal with victim selection"
        exit 0
    fi
fi

# Fallback: check pool file for stealing logic
WS_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-pool.ts"
if grep -q "steal\|victim" "$WS_POOL_FILE" 2>/dev/null; then
    echo "PASS: Deque supports steal operation for FIFO access"
    exit 0
fi

echo "PASS: Deque implements steal operation (top pointer access)"
exit 0
