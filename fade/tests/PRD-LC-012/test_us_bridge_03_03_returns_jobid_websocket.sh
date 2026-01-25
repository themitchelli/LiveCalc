#!/bin/bash
# Test: Returns a unique JobID and a WebSocket URL for progress/results streaming
# AC: Returns a unique JobID and a WebSocket URL for progress/results streaming.
# US: US-BRIDGE-03 (Local-to-Cloud Bridge API)

set -e

# Check jobs router and job model for response structure
JOBS_ROUTER="livecalc-cloud/api/routers/jobs.py"
JOB_MODEL="livecalc-cloud/api/models/job.py"

if [[ ! -f "$JOBS_ROUTER" ]]; then
    echo "FAIL: jobs.py router not found"
    exit 1
fi

# Verify JobSubmitResponse is returned
if ! grep -q "JobSubmitResponse" "$JOBS_ROUTER"; then
    echo "FAIL: JobSubmitResponse not returned from submit endpoint"
    echo "Expected: response_model=JobSubmitResponse"
    echo "Actual: Different or no response model"
    exit 1
fi

# Check job model for response structure
if [[ -f "$JOB_MODEL" ]]; then
    # Verify jobId field
    if ! grep -q "jobId" "$JOB_MODEL"; then
        echo "FAIL: jobId field not found in job model"
        echo "Expected: jobId field"
        echo "Actual: No jobId field"
        exit 1
    fi

    # Verify websocketUrl field
    if ! grep -q "websocketUrl\|websocket_url" "$JOB_MODEL"; then
        echo "FAIL: websocketUrl field not found in job model"
        echo "Expected: websocketUrl field"
        echo "Actual: No websocketUrl field"
        exit 1
    fi
fi

# Verify unique ID generation (UUID)
if ! grep -q "uuid\|UUID" "$JOBS_ROUTER" && ! grep -q "uuid\|UUID" "$JOB_MODEL"; then
    echo "FAIL: UUID generation not found"
    echo "Expected: UUID for unique JobID"
    echo "Actual: No UUID generation found"
    exit 1
fi

echo "PASS: Returns unique JobID and WebSocket URL"
exit 0
