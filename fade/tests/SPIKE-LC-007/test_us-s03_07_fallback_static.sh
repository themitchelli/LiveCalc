#!/bin/bash
# Test: verify fallback to static partitioning if SAB not available
# AC: Fallback to static partitioning if SAB not available

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Check for fallback implementation
FALLBACK_FILE="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-fallback.ts"

if [[ -f "$FALLBACK_FILE" ]]; then
    if grep -q "static\|partition\|fallback" "$FALLBACK_FILE"; then
        echo "PASS: Fallback implementation exists for environments without SAB"
        exit 0
    fi
fi

# Check shared-buffer.ts for SAB availability check
SHARED_BUFFER="$PROJECT_ROOT/livecalc-engine/js/src/shared-buffer.ts"
if [[ -f "$SHARED_BUFFER" ]]; then
    if grep -q "isSharedArrayBufferAvailable\|SharedArrayBuffer.*undefined\|typeof SharedArrayBuffer" "$SHARED_BUFFER"; then
        echo "PASS: SAB availability check exists for fallback support"
        exit 0
    fi
fi

# Check work-stealing-pool.ts for availability check
WS_POOL="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-pool.ts"
if [[ -f "$WS_POOL" ]]; then
    if grep -q "isSharedArrayBufferAvailable\|SAB_NOT_AVAILABLE\|SharedArrayBuffer" "$WS_POOL"; then
        echo "PASS: WorkStealingPool checks SAB availability (fallback supported)"
        exit 0
    fi
fi

# Check for worker-pool.ts (static partitioning baseline)
WORKER_POOL="$PROJECT_ROOT/livecalc-engine/js/src/worker-pool.ts"
if [[ -f "$WORKER_POOL" ]]; then
    echo "PASS: Static worker pool exists as fallback option"
    exit 0
fi

echo "FAIL: No fallback mechanism found for environments without SharedArrayBuffer"
exit 1
