#!/bin/bash
# Test: verify WorkStealingPool class with per-worker deques exists
# AC: WorkStealingPool class with per-worker deques

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

WS_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-pool.ts"

if [[ ! -f "$WS_POOL_FILE" ]]; then
    echo "FAIL: WorkStealingPool file not found"
    echo "Expected: $WS_POOL_FILE"
    exit 1
fi

# Check for WorkStealingPool class
if ! grep -q "class WorkStealingPool" "$WS_POOL_FILE"; then
    echo "FAIL: WorkStealingPool class not found"
    echo "Expected: 'class WorkStealingPool' in work-stealing-pool.ts"
    exit 1
fi

# Check for deque pool usage
if ! grep -q "dequePool\|WorkStealingDequePool" "$WS_POOL_FILE"; then
    echo "FAIL: Per-worker deque pool not found"
    echo "Expected: dequePool or WorkStealingDequePool reference"
    exit 1
fi

# Check for deque file
DEQUE_FILE="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-deque.ts"
if [[ ! -f "$DEQUE_FILE" ]]; then
    echo "FAIL: Work-stealing deque implementation not found"
    echo "Expected: $DEQUE_FILE"
    exit 1
fi

echo "PASS: WorkStealingPool class exists with per-worker deques"
exit 0
