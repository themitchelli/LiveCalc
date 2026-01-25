#!/bin/bash
# Test: Verify MTTC (Mean Time to Re-compute) - deleted namespace run can resume in < 2 mins with identical hashes
# AC: MTTC (Mean Time to Re-compute) Verification: A deleted namespace run can be resumed from the Hashed Model Bundle in < 2 mins with identical result hashes

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
AUTH_TOKEN="${AUTH_TOKEN:-test-token}"
BUCKET_ID="test-mttc-$(date +%s)"
MODEL_BUNDLE_HASH="sha256-abc123def456"

# Act - Call MTTC verification endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${API_BASE_URL}/v1/platform/mttc/verify" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"bucket_id\": \"${BUCKET_ID}\", \"model_bundle_hash\": \"${MODEL_BUNDLE_HASH}\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

# Assert - Check HTTP status
if [[ "$HTTP_CODE" != "200" ]]; then
    echo "FAIL: MTTC verification endpoint returned error"
    echo "Expected: 200"
    echo "Actual: ${HTTP_CODE}"
    echo "Response: ${BODY}"
    exit 1
fi

# Assert - Check success field
SUCCESS=$(echo "$BODY" | grep -o '"success":true' || true)
if [[ -z "$SUCCESS" ]]; then
    echo "FAIL: MTTC verification failed"
    echo "Expected: success=true"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Check result hashes match
MATCH=$(echo "$BODY" | grep -o '"match":true' || true)
if [[ -z "$MATCH" ]]; then
    echo "FAIL: Result hashes do not match"
    echo "Expected: match=true (identical result hashes)"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Duration is under 120 seconds (2 minutes)
DURATION=$(echo "$BODY" | grep -o '"duration_seconds":[0-9.]*' | cut -d':' -f2)
if [[ -z "$DURATION" ]]; then
    echo "FAIL: Duration not reported"
    echo "Expected: duration_seconds < 120"
    echo "Actual: ${BODY}"
    exit 1
fi

# Compare duration (bash doesn't do float comparison well, so use awk)
WITHIN_LIMIT=$(echo "$DURATION" | awk '{print ($1 < 120) ? "yes" : "no"}')
if [[ "$WITHIN_LIMIT" != "yes" ]]; then
    echo "FAIL: MTTC exceeded 2 minute limit"
    echo "Expected: duration < 120 seconds"
    echo "Actual: ${DURATION} seconds"
    exit 1
fi

echo "PASS: MTTC verification passed - resumed in ${DURATION}s with matching hashes"
exit 0
