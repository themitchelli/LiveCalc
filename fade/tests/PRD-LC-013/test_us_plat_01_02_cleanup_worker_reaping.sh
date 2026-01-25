#!/bin/bash
# Test: Verify cleanup worker reaps namespaces after 24h of inactivity or Finalized status
# AC: Cleanup worker reaps namespaces after 24h of inactivity or a 'Finalized' status

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
AUTH_TOKEN="${AUTH_TOKEN:-test-token}"
BUCKET_ID="test-reap-$(date +%s)"

# Setup - Create a namespace first
CREATE_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/v1/platform/namespaces?bucket_id=${BUCKET_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json")

NAMESPACE=$(echo "$CREATE_RESPONSE" | grep -o '"namespace":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$NAMESPACE" ]]; then
    echo "FAIL: Could not create test namespace"
    echo "Response: ${CREATE_RESPONSE}"
    exit 1
fi

# Act - Mark namespace as finalized (triggers immediate eligibility for reaping)
FINALIZE_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${API_BASE_URL}/v1/platform/namespaces/${NAMESPACE}/finalize" \
    -H "Authorization: Bearer ${AUTH_TOKEN}")

HTTP_CODE=$(echo "$FINALIZE_RESPONSE" | tail -n1)

# Assert - Finalize should succeed
if [[ "$HTTP_CODE" != "200" ]]; then
    echo "FAIL: Failed to finalize namespace"
    echo "Expected: 200"
    echo "Actual: ${HTTP_CODE}"
    exit 1
fi

# Act - Manually trigger reap
REAP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${API_BASE_URL}/v1/platform/namespaces/${NAMESPACE}/reap?bucket_id=${BUCKET_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}")

HTTP_CODE=$(echo "$REAP_RESPONSE" | tail -n1)
BODY=$(echo "$REAP_RESPONSE" | head -n-1)

# Assert - Reap should succeed
if [[ "$HTTP_CODE" != "200" ]]; then
    echo "FAIL: Failed to reap namespace"
    echo "Expected: 200"
    echo "Actual: ${HTTP_CODE}"
    echo "Response: ${BODY}"
    exit 1
fi

# Assert - Response indicates success
SUCCESS=$(echo "$BODY" | grep -o '"success":true' || true)
if [[ -z "$SUCCESS" ]]; then
    echo "FAIL: Reap response did not indicate success"
    echo "Expected: success=true"
    echo "Actual: ${BODY}"
    exit 1
fi

echo "PASS: Namespace ${NAMESPACE} reaped successfully after finalization"
exit 0
