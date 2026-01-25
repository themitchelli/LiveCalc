#!/bin/bash
# Test: Verify API automatically creates a scoped K8s Namespace for every new Bucket
# AC: API automatically creates a scoped K8s Namespace for every new Bucket

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
AUTH_TOKEN="${AUTH_TOKEN:-test-token}"
BUCKET_ID="test-bucket-$(date +%s)"

# Act - Create namespace via API
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${API_BASE_URL}/v1/platform/namespaces?bucket_id=${BUCKET_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

# Assert - Check HTTP status code
if [[ "$HTTP_CODE" != "201" ]]; then
    echo "FAIL: Expected HTTP 201, got ${HTTP_CODE}"
    echo "Expected: 201 (Created)"
    echo "Actual: ${HTTP_CODE}"
    echo "Response: ${BODY}"
    exit 1
fi

# Assert - Check response contains namespace
NAMESPACE=$(echo "$BODY" | grep -o '"namespace":"[^"]*"' | cut -d'"' -f4)
if [[ -z "$NAMESPACE" ]]; then
    echo "FAIL: Response missing namespace field"
    echo "Expected: namespace in response"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Namespace follows naming convention (livecalc-{bucket_id})
if [[ ! "$NAMESPACE" =~ ^livecalc- ]]; then
    echo "FAIL: Namespace doesn't follow naming convention"
    echo "Expected: namespace starting with 'livecalc-'"
    echo "Actual: ${NAMESPACE}"
    exit 1
fi

# Assert - Check bucket_id is in response
RESPONSE_BUCKET=$(echo "$BODY" | grep -o '"bucket_id":"[^"]*"' | cut -d'"' -f4)
if [[ "$RESPONSE_BUCKET" != "$BUCKET_ID" ]]; then
    echo "FAIL: Bucket ID mismatch"
    echo "Expected: ${BUCKET_ID}"
    echo "Actual: ${RESPONSE_BUCKET}"
    exit 1
fi

echo "PASS: Namespace ${NAMESPACE} created successfully for bucket ${BUCKET_ID}"
exit 0
