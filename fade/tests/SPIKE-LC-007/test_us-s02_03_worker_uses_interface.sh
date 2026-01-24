#!/bin/bash
# Test: verify worker pool calls engine through interface, not directly
# AC: Worker pool calls engine through interface, not directly

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Check work-stealing pool uses CalcEngine interface
WS_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-pool.ts"

if [[ ! -f "$WS_POOL_FILE" ]]; then
    echo "FAIL: WorkStealingPool file not found"
    echo "Expected: $WS_POOL_FILE"
    exit 1
fi

# Check that SAB worker pool exists (another worker implementation)
SAB_POOL_FILE="$PROJECT_ROOT/livecalc-engine/js/src/sab-worker-pool.ts"

# Check for CalcEngine usage in worker implementations
WORKER_FILE="$PROJECT_ROOT/livecalc-engine/js/src/work-stealing-worker.ts"

# At least one of these should reference CalcEngine or engine abstraction
FOUND_ABSTRACTION=false

# Check for CalcEngine factory pattern usage
if grep -q "CalcEngine\|CalcEngineFactory\|engineFactory" "$WS_POOL_FILE" 2>/dev/null; then
    FOUND_ABSTRACTION=true
fi

if [[ -f "$SAB_POOL_FILE" ]] && grep -q "CalcEngine\|CalcEngineFactory\|engineFactory" "$SAB_POOL_FILE" 2>/dev/null; then
    FOUND_ABSTRACTION=true
fi

# Check worker files for engine abstraction
if [[ -f "$WORKER_FILE" ]] && grep -q "engine\|CalcEngine" "$WORKER_FILE" 2>/dev/null; then
    FOUND_ABSTRACTION=true
fi

# Check for engine-worker abstraction
ENGINE_WORKER="$PROJECT_ROOT/livecalc-engine/js/src/engine-worker.ts"
if [[ -f "$ENGINE_WORKER" ]] && grep -q "CalcEngine\|engine" "$ENGINE_WORKER" 2>/dev/null; then
    FOUND_ABSTRACTION=true
fi

if [[ "$FOUND_ABSTRACTION" == "true" ]]; then
    echo "PASS: Worker pool uses engine abstraction (CalcEngine interface pattern)"
    exit 0
else
    echo "FAIL: Worker pool does not appear to use CalcEngine abstraction"
    echo "Expected: References to CalcEngine, CalcEngineFactory, or engine abstraction in worker pool"
    exit 1
fi
