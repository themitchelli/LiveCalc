#!/bin/bash
# Test: Verify KEDA ScaledObject is configured to watch the job queue
# AC: KEDA ScaledObject configured to watch the job queue

set -e

# Configuration - Path to KEDA ScaledObject manifest
KEDA_MANIFEST="${KEDA_MANIFEST:-livecalc-cloud/k8s/keda-scaledobject.yaml}"

# Check manifest exists
if [[ ! -f "$KEDA_MANIFEST" ]]; then
    echo "FAIL: KEDA manifest not found at ${KEDA_MANIFEST}"
    exit 1
fi

# Assert - Check ScaledObject kind exists
SCALED_OBJECT=$(grep -c "kind: ScaledObject" "$KEDA_MANIFEST" || true)
if [[ "$SCALED_OBJECT" -lt 1 ]]; then
    echo "FAIL: No ScaledObject defined in manifest"
    echo "Expected: kind: ScaledObject"
    exit 1
fi

# Assert - Check minReplicaCount is 0 (scale to zero)
MIN_REPLICAS=$(grep -E "^\s+minReplicaCount:\s*0" "$KEDA_MANIFEST" || true)
if [[ -z "$MIN_REPLICAS" ]]; then
    echo "FAIL: minReplicaCount not set to 0 (scale-to-zero)"
    echo "Expected: minReplicaCount: 0"
    exit 1
fi

# Assert - Check redis trigger is configured
REDIS_TRIGGER=$(grep -c "type: redis" "$KEDA_MANIFEST" || true)
if [[ "$REDIS_TRIGGER" -lt 1 ]]; then
    echo "FAIL: Redis trigger not configured"
    echo "Expected: type: redis trigger watching job queue"
    exit 1
fi

# Assert - Check jobs:QUEUED list is targeted
QUEUE_LIST=$(grep "listName: jobs:QUEUED" "$KEDA_MANIFEST" || true)
if [[ -z "$QUEUE_LIST" ]]; then
    echo "FAIL: KEDA not watching jobs:QUEUED"
    echo "Expected: listName: jobs:QUEUED"
    exit 1
fi

# Assert - Check maxReplicaCount is configured
MAX_REPLICAS=$(grep -E "maxReplicaCount:\s*100" "$KEDA_MANIFEST" || true)
if [[ -z "$MAX_REPLICAS" ]]; then
    echo "FAIL: maxReplicaCount not configured or not set to 100"
    echo "Expected: maxReplicaCount: 100"
    exit 1
fi

echo "PASS: KEDA ScaledObject correctly configured to watch job queue with scale-to-zero"
exit 0
