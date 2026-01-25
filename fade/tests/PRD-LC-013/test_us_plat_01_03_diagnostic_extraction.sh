#!/bin/bash
# Test: Verify diagnostic extraction includes pod logs and sentinel violations in Azure Blob
# AC: Diagnostic Extraction: Before reaping, verify: (1) All pod logs are present in Azure Blob, (2) Memory Sentinel violations are extracted and indexed

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
AUTH_TOKEN="${AUTH_TOKEN:-test-token}"
BUCKET_ID="test-diag-$(date +%s)"

# Setup - Create and finalize a namespace
CREATE_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/v1/platform/namespaces?bucket_id=${BUCKET_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json")

NAMESPACE=$(echo "$CREATE_RESPONSE" | grep -o '"namespace":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$NAMESPACE" ]]; then
    echo "FAIL: Could not create test namespace"
    exit 1
fi

# Finalize the namespace
curl -s -X POST "${API_BASE_URL}/v1/platform/namespaces/${NAMESPACE}/finalize" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" > /dev/null

# Act - Reap namespace (which should extract diagnostics first)
REAP_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/v1/platform/namespaces/${NAMESPACE}/reap?bucket_id=${BUCKET_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}")

# Assert - Check logs_archived is true
LOGS_ARCHIVED=$(echo "$REAP_RESPONSE" | grep -o '"logs_archived":true' || true)
if [[ -z "$LOGS_ARCHIVED" ]]; then
    echo "FAIL: Pod logs not archived to Azure Blob"
    echo "Expected: logs_archived=true"
    echo "Actual: ${REAP_RESPONSE}"
    exit 1
fi

# Assert - Check sentinel_violations_indexed is true
VIOLATIONS_INDEXED=$(echo "$REAP_RESPONSE" | grep -o '"sentinel_violations_indexed":true' || true)
if [[ -z "$VIOLATIONS_INDEXED" ]]; then
    echo "FAIL: Sentinel violations not indexed"
    echo "Expected: sentinel_violations_indexed=true"
    echo "Actual: ${REAP_RESPONSE}"
    exit 1
fi

# Assert - Check blob_paths contains expected paths
BLOB_PATHS=$(echo "$REAP_RESPONSE" | grep -o '"blob_paths":\[[^]]*\]' || true)
if [[ -z "$BLOB_PATHS" ]]; then
    echo "FAIL: No blob paths returned in diagnostics"
    echo "Expected: blob_paths array with storage paths"
    echo "Actual: ${REAP_RESPONSE}"
    exit 1
fi

echo "PASS: Diagnostic extraction verified - logs archived and sentinel violations indexed"
exit 0
