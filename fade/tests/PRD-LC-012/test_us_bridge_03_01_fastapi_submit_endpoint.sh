#!/bin/bash
# Test: FastAPI endpoint POST /v1/jobs/submit exists for Multipart upload
# AC: FastAPI endpoint: POST /v1/jobs/submit (Multipart upload).
# US: US-BRIDGE-03 (Local-to-Cloud Bridge API)

set -e

# Check jobs router for submit endpoint
JOBS_ROUTER="livecalc-cloud/api/routers/jobs.py"

if [[ ! -f "$JOBS_ROUTER" ]]; then
    echo "FAIL: jobs.py router not found at $JOBS_ROUTER"
    echo "Expected: File exists"
    echo "Actual: File not found"
    exit 1
fi

# Verify POST /submit endpoint exists
if ! grep -q "@router.post.*\"/submit\"" "$JOBS_ROUTER"; then
    echo "FAIL: POST /submit endpoint not found"
    echo "Expected: @router.post(\"/submit\")"
    echo "Actual: No submit endpoint found"
    exit 1
fi

# Verify multipart upload (UploadFile)
if ! grep -q "UploadFile" "$JOBS_ROUTER"; then
    echo "FAIL: Multipart file upload not supported"
    echo "Expected: UploadFile parameter"
    echo "Actual: No UploadFile found"
    exit 1
fi

# Verify router prefix
if ! grep -q "/v1/jobs" "$JOBS_ROUTER"; then
    echo "FAIL: Router prefix not /v1/jobs"
    echo "Expected: prefix=\"/v1/jobs\""
    echo "Actual: Different or no prefix"
    exit 1
fi

echo "PASS: FastAPI POST /v1/jobs/submit endpoint exists for Multipart upload"
exit 0
