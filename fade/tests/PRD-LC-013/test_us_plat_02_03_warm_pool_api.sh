#!/bin/bash
# Test: Verify Warm-Pool API to keep N nodes ready during high-intensity windows
# AC: Support for 'Warm-Pool' optimization via API to keep N nodes ready during high-intensity reporting windows

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
AUTH_TOKEN="${AUTH_TOKEN:-test-token}"

# Test 1: Configure warm pool - enable with 5 pods
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${API_BASE_URL}/v1/platform/warm-pool/configure" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"enabled": true, "size": 5, "timeout_minutes": 60}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

# Assert - Check HTTP status
if [[ "$HTTP_CODE" != "200" ]]; then
    echo "FAIL: Warm pool configure endpoint returned error"
    echo "Expected: 200"
    echo "Actual: ${HTTP_CODE}"
    echo "Response: ${BODY}"
    exit 1
fi

# Assert - Check enabled is true
ENABLED=$(echo "$BODY" | grep -o '"enabled":true' || true)
if [[ -z "$ENABLED" ]]; then
    echo "FAIL: Warm pool not enabled in response"
    echo "Expected: enabled=true"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Check size is 5
SIZE=$(echo "$BODY" | grep -o '"size":5' || true)
if [[ -z "$SIZE" ]]; then
    echo "FAIL: Warm pool size not set to 5"
    echo "Expected: size=5"
    echo "Actual: ${BODY}"
    exit 1
fi

# Test 2: Get warm pool status
STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X GET "${API_BASE_URL}/v1/platform/warm-pool/status" \
    -H "Authorization: Bearer ${AUTH_TOKEN}")

HTTP_CODE=$(echo "$STATUS_RESPONSE" | tail -n1)
BODY=$(echo "$STATUS_RESPONSE" | head -n-1)

# Assert - Status endpoint works
if [[ "$HTTP_CODE" != "200" ]]; then
    echo "FAIL: Warm pool status endpoint returned error"
    echo "Expected: 200"
    echo "Actual: ${HTTP_CODE}"
    exit 1
fi

# Assert - Status shows enabled
ENABLED_STATUS=$(echo "$BODY" | grep -o '"enabled":true' || true)
if [[ -z "$ENABLED_STATUS" ]]; then
    echo "FAIL: Warm pool status does not show enabled"
    echo "Expected: enabled=true"
    echo "Actual: ${BODY}"
    exit 1
fi

# Test 3: Disable warm pool
DISABLE_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${API_BASE_URL}/v1/platform/warm-pool/configure" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"enabled": false, "size": 0}')

HTTP_CODE=$(echo "$DISABLE_RESPONSE" | tail -n1)
BODY=$(echo "$DISABLE_RESPONSE" | head -n-1)

# Assert - Disable succeeds
if [[ "$HTTP_CODE" != "200" ]]; then
    echo "FAIL: Failed to disable warm pool"
    echo "Expected: 200"
    echo "Actual: ${HTTP_CODE}"
    exit 1
fi

# Assert - Check enabled is false
DISABLED=$(echo "$BODY" | grep -o '"enabled":false' || true)
if [[ -z "$DISABLED" ]]; then
    echo "FAIL: Warm pool not disabled"
    echo "Expected: enabled=false"
    echo "Actual: ${BODY}"
    exit 1
fi

echo "PASS: Warm pool API supports enabling/disabling N nodes for high-intensity windows"
exit 0
